const DEFAULT_IMAGE_MIME = "image/png";

// 远端图片 API 客户端，负责调用文生图和图文生图接口
export class RemoteImageClient {
  constructor(config) {
    this.config = config;
  }

  // 调用文生图接口并返回标准化 base64 图片数组
  async createTextImages(request) {
    const response = await fetch(this.config.generationUrl, this.#createJsonRequest(request));
    const payload = await this.#readApiPayload(response);

    return this.#extractImages(payload);
  }

  // 调用图文生图接口并返回标准化 base64 图片数组
  async createImageEdits(request) {
    const formData = this.#createEditFormData(request);
    const response = await fetch(this.config.editUrl, this.#createFormRequest(formData));
    const payload = await this.#readApiPayload(response);

    return this.#extractImages(payload);
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
  async #readApiPayload(response) {
    const text = await response.text();
    const payload = parseJsonPayload(text);

    if (!response.ok) {
      throw new Error(payload.error?.message ?? payload.message ?? `图片接口失败：HTTP ${response.status}`);
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
      "3:4": "768x1024",
      "4:3": "1024x768",
      "16:9": "1344x768",
      "9:16": "768x1344"
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
