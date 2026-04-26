const DEFAULT_IMAGE_MIME = "image/png";
const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 800;
const MAX_BODY_PREVIEW_LENGTH = 600;

// 远端图片 API 客户端，负责调用文生图和图文生图接口
export class RemoteImageClient {
  constructor(config, options = {}) {
    this.config = config;
    this.fetcher = options.fetcher ?? fetch;
    this.logger = options.logger ?? console;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  // 调用文生图接口并返回标准化 base64 图片数组
  async createTextImages(request) {
    const payload = await this.#requestPayload(
      "text-to-image",
      this.config.generationUrl,
      () => this.#createJsonRequest(request)
    );

    return this.#extractImages(payload);
  }

  // 调用图文生图接口并返回标准化 base64 图片数组
  async createImageEdits(request) {
    const payload = await this.#requestPayload(
      "image-edit",
      this.config.editUrl,
      () => this.#createFormRequest(this.#createEditFormData(request))
    );

    return this.#extractImages(payload);
  }

  // 请求远端图片接口，统一处理超时、日志和短重试
  async #requestPayload(endpointName, url, createRequest) {
    this.#assertEndpointConfigured(endpointName, url);

    for (let attempt = 0; attempt <= this.#maxRetries(); attempt += 1) {
      try {
        return await this.#requestPayloadOnce(endpointName, url, createRequest, attempt);
      } catch (error) {
        this.#logUpstreamFailure(endpointName, error, attempt);
        if (!this.#shouldRetry(error, attempt)) throw toPublicUpstreamError(error);
        await wait(this.retryDelayMs);
      }
    }

    throw new Error("图片上游请求失败");
  }

  // 执行单次上游请求并返回解析后的响应体
  async #requestPayloadOnce(endpointName, url, createRequest, attempt) {
    const startedAt = Date.now();

    try {
      const response = await this.#fetchWithTimeout(url, createRequest());
      return await this.#readApiPayload(response, {
        endpointName,
        url,
        attempt,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      throw wrapFetchError(error, endpointName, url, attempt, Date.now() - startedAt);
    }
  }

  // 创建文生图 JSON 请求配置
  #createJsonRequest(request) {
    return {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.#resolveRemoteModel(request.modelName),
        prompt: request.prompt,
        n: request.quantity,
        size: this.#resolveImageSize(request.ratio),
        response_format: "b64_json"
      })
    };
  }

  // 带超时信号调用 fetch，避免上游卡死拖住业务请求
  async #fetchWithTimeout(url, request) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs());

    try {
      return await this.fetcher(url, { ...request, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  // 创建图文生图 multipart 请求配置
  #createFormRequest(formData) {
    return {
      method: "POST",
      headers: { "Authorization": `Bearer ${this.config.key}` },
      body: formData
    };
  }

  // 创建图文生图表单数据
  #createEditFormData(request) {
    const imageFile = parseDataUrlImage(request.referenceImage);
    const formData = new FormData();

    formData.set("model", this.#resolveRemoteModel(request.modelName));
    formData.set("prompt", request.prompt);
    formData.set("n", String(request.quantity));
    formData.set("size", this.#resolveImageSize(request.ratio));
    formData.set("response_format", "b64_json");
    formData.set("image", imageFile.blob, request.referenceImageName || "reference.png");

    return formData;
  }

  // 读取远端响应，非 2xx 时抛出可读错误
  async #readApiPayload(response, context) {
    const text = await response.text();
    const payload = parseJsonPayload(text);

    if (!response.ok) {
      throw createUpstreamHttpError(response, payload, text, context);
    }

    return payload;
  }

  // 从不同兼容格式中提取 base64 图片
  #extractImages(payload) {
    const items = Array.isArray(payload.data) ? payload.data : [];
    const images = items.map((item) => item.b64_json ?? item.base64 ?? item.image).filter(Boolean);

    if (images.length === 0 && typeof payload.b64_json === "string") {
      return [payload.b64_json];
    }

    if (images.length === 0) {
      throw new Error("图片接口未返回 base64 图片");
    }

    return images.map((base64) => normalizeBase64Image(base64));
  }

  // 根据画幅比例映射远端 API size 参数
  #resolveImageSize(ratio) {
    const sizes = {
      "1:1": "1024x1024",
      "4:3": "1024x768",
      "16:9": "1344x768"
    };

    return sizes[ratio] ?? sizes["4:3"];
  }

  // 将界面展示模型映射为远端 API 可识别的图片模型
  #resolveRemoteModel(modelName) {
    const name = String(modelName ?? "");

    if (name.startsWith("gpt-image") || name.startsWith("dall-e")) {
      return name;
    }

    return this.config.model;
  }

  // 校验上游地址是否配置，避免空 URL 变成迷惑性 fetch 错误
  #assertEndpointConfigured(endpointName, url) {
    if (!url) {
      throw new Error(`图片上游地址未配置：${endpointName}`);
    }
  }

  // 获取上游请求超时时间，非法配置回退到默认值
  #timeoutMs() {
    const timeoutMs = Number(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  }

  // 获取上游短重试次数，非法配置回退到默认值
  #maxRetries() {
    const maxRetries = Number(this.config.maxRetries ?? DEFAULT_MAX_RETRIES);
    return Number.isFinite(maxRetries) && maxRetries >= 0 ? Math.floor(maxRetries) : DEFAULT_MAX_RETRIES;
  }

  // 判断本次错误是否还允许重试
  #shouldRetry(error, attempt) {
    return Boolean(error.retryable) && attempt < this.#maxRetries();
  }

  // 记录上游失败上下文，避免线上只看到笼统报错
  #logUpstreamFailure(endpointName, error, attempt) {
    const level = this.#shouldRetry(error, attempt) ? "warn" : "error";
    const log = this.logger?.[level] ?? this.logger?.error;
    if (!log) return;

    log.call(this.logger, createFailureLogPayload(endpointName, error, attempt));
  }
}

// 上游请求错误，携带可观测上下文和重试语义
class UpstreamRequestError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "UpstreamRequestError";
    this.status = options.status ?? null;
    this.retryable = Boolean(options.retryable);
    this.upstreamUrl = options.upstreamUrl ?? "";
    this.durationMs = options.durationMs ?? 0;
    this.bodyPreview = options.bodyPreview ?? "";
    this.attempt = options.attempt ?? 0;
  }
}

// 创建上游 HTTP 错误对象，保留响应片段供日志排查
function createUpstreamHttpError(response, payload, text, context) {
  const upstreamMessage = payload.error?.message ?? payload.message ?? `HTTP ${response.status}`;

  return new UpstreamRequestError(`图片上游请求失败：${upstreamMessage}`, {
    status: response.status,
    retryable: isRetryableStatus(response.status),
    upstreamUrl: context.url,
    durationMs: context.durationMs,
    bodyPreview: createBodyPreview(text),
    attempt: context.attempt
  });
}

// 包装 fetch 网络错误，区分超时和普通网络异常
function wrapFetchError(error, endpointName, url, attempt, durationMs) {
  if (error instanceof UpstreamRequestError) return error;

  const message = error.name === "AbortError" ? "请求超时" : (error.message || "网络异常");
  return new UpstreamRequestError(`图片上游请求失败：${message}`, {
    cause: error,
    retryable: true,
    upstreamUrl: url,
    durationMs,
    bodyPreview: "",
    attempt
  });
}

// 转换为对前端展示的普通错误，避免暴露多余内部字段
function toPublicUpstreamError(error) {
  return new Error(error.message || "图片上游请求失败", { cause: error });
}

// 生成上游失败日志对象，不记录密钥和请求正文
function createFailureLogPayload(endpointName, error, attempt) {
  return {
    event: "image_upstream_failed",
    endpointName,
    attempt: attempt + 1,
    status: error.status ?? null,
    retryable: Boolean(error.retryable),
    durationMs: error.durationMs ?? 0,
    upstreamUrl: error.upstreamUrl ?? "",
    message: error.message,
    bodyPreview: error.bodyPreview ?? ""
  };
}

// 判断 HTTP 状态是否属于可短重试的临时失败
function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

// 截断响应正文，避免日志被大响应刷爆
function createBodyPreview(text) {
  return String(text ?? "").slice(0, MAX_BODY_PREVIEW_LENGTH);
}

// 等待指定毫秒数，用于短重试退避
function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds));
  });
}

// 解析 JSON 字符串，异常时保留原始响应文本
function parseJsonPayload(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text || "图片接口返回无法解析" };
  }
}

// 把 data URL 图片转换为 Blob，供 multipart 上传
function parseDataUrlImage(dataUrl) {
  const match = String(dataUrl ?? "").match(/^data:(.*?);base64,(.+)$/);

  if (!match) {
    throw new Error("请先上传参考图");
  }

  const mimeType = match[1] || DEFAULT_IMAGE_MIME;
  const bytes = Buffer.from(match[2], "base64");

  return { blob: new Blob([bytes], { type: mimeType }), mimeType };
}

// 标准化 base64 图片，前端统一可直接作为 data URL 渲染
function normalizeBase64Image(value) {
  if (String(value).startsWith("data:image/")) {
    return value;
  }

  return `data:${DEFAULT_IMAGE_MIME};base64,${value}`;
}
