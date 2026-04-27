export const GenerationMode = Object.freeze({
  TextToImage: "text-to-image",
  ImagePrompt: "image-prompt"
});

export const IMAGE_RATIOS = Object.freeze(["1:1", "4:3", "16:9"]);

export const DEFAULT_GENERATION_MODEL = "Aurora XL v2";

export const DEFAULT_IMAGE_SIZE = "1024x768";
export const DEFAULT_IMAGE_RATIO = "1:1";
export const DEFAULT_IMAGE_QUANTITY = 1;
const IMAGE_QUALITIES = new Set(["low", "medium", "high", "auto"]);
const OUTPUT_FORMATS = new Set(["png", "jpeg", "webp"]);
const DEFAULT_IMAGE_QUALITY = "auto";
const DEFAULT_OUTPUT_FORMAT = "png";
const DEFAULT_OUTPUT_COMPRESSION = 100;

// 生成请求对象，统一清洗并保存前端传入的图片生成参数
export class GenerationRequest {
  constructor(input) {
    this.mode = input.mode ?? GenerationMode.TextToImage;
    this.prompt = this.#trimText(input.prompt);
    this.negativePrompt = this.#trimText(input.negativePrompt);
    this.imageName = input.imageName ?? "";
    this.ratio = input.ratio ?? DEFAULT_IMAGE_RATIO;
    this.style = input.style ?? "product";
    this.modelName = input.modelName ?? input.model ?? DEFAULT_GENERATION_MODEL;
    this.fidelity = Number(input.fidelity ?? 75);
    this.quantity = Number(input.quantity ?? DEFAULT_IMAGE_QUANTITY);
    this.quality = this.#normalizeQuality(input.quality);
    this.outputFormat = this.#normalizeOutputFormat(input.outputFormat);
    this.outputCompression = this.#normalizeOutputCompression(input.outputCompression);
    this.isPublic = Boolean(input.isPublic);
  }

  // 清洗文本字段，避免空值和多余空格污染业务对象
  #trimText(value) {
    return String(value ?? "").trim();
  }

  // 规范化图片质量枚举，避免非法值透传给上游
  #normalizeQuality(value) {
    const quality = String(value ?? DEFAULT_IMAGE_QUALITY).trim().toLowerCase();

    return IMAGE_QUALITIES.has(quality) ? quality : DEFAULT_IMAGE_QUALITY;
  }

  // 规范化输出格式枚举，确保压缩参数只围绕明确格式工作
  #normalizeOutputFormat(value) {
    const outputFormat = String(value ?? DEFAULT_OUTPUT_FORMAT).trim().toLowerCase();

    return OUTPUT_FORMATS.has(outputFormat) ? outputFormat : DEFAULT_OUTPUT_FORMAT;
  }

  // 规范化输出压缩等级，限制在上游支持的 0 到 100 区间
  #normalizeOutputCompression(value) {
    const compression = Number(value ?? DEFAULT_OUTPUT_COMPRESSION);

    if (!Number.isFinite(compression)) return DEFAULT_OUTPUT_COMPRESSION;
    return Math.min(100, Math.max(0, Math.round(compression)));
  }
}

// 根据提示词生成稳定正整数种子，便于历史记录和占位渲染复现
export function createPromptSeed(prompt) {
  const source = String(prompt ?? "");
  let hash = 2166136261;

  for (const character of source) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0) + 1;
}

// 根据种子创建确定性色板，用于接口失败时的本地占位预览
export function createDeterministicPalette(seed) {
  const baseHue = seed % 360;

  return [0, 52, 126].map((offset) => {
    const hue = (baseHue + offset) % 360;

    return `hsl(${hue} 68% 48%)`;
  });
}
