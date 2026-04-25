import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_PUBLIC_PREFIX = "/generated-images";
const MACOS_STORAGE_DIR = "storage/kimo-images";
const LINUX_STORAGE_ROOT = "/opt/kimo-images";
const DEFAULT_IMAGE_EXTENSION = "png";

// 创建图片存储配置，macOS 写项目目录，Linux 写 /opt/kimo-images
export function createImageStorageConfig(input) {
  const platform = input.platform;
  const projectRoot = input.projectRoot;
  const storageRoot = platform === "linux" ? LINUX_STORAGE_ROOT : join(projectRoot, MACOS_STORAGE_DIR);

  return {
    storageRoot,
    publicPrefix: DEFAULT_PUBLIC_PREFIX
  };
}

// 图片存储服务，负责把远端 base64 图片落盘并返回服务器相对路径
export class ImageStorageService {
  constructor(config) {
    this.storageRoot = config.storageRoot;
    this.publicPrefix = config.publicPrefix;
  }

  // 保存一次生成任务的所有图片，并返回可访问的服务器相对路径
  async saveGenerationImages(input) {
    const imageItems = input.images.map((image, index) => {
      return this.#createImageItem(input.userId, input.generationId, image, index);
    });

    await Promise.all(imageItems.map((item) => this.#writeImageItem(item)));

    return imageItems.map((item) => item.publicPath);
  }

  // 根据服务器相对路径解析到磁盘真实路径
  resolvePublicPath(publicPath) {
    const relativePath = String(publicPath ?? "").replace(this.publicPrefix, "").replace(/^[/\\]/, "");

    return join(this.storageRoot, relativePath);
  }

  // 创建单张图片的路径和内容对象
  #createImageItem(userId, generationId, image, index) {
    const fileName = `image-${index + 1}.${DEFAULT_IMAGE_EXTENSION}`;
    const relativeDir = join(`user-${userId}`, `generation-${generationId}`);
    const publicPath = `${this.publicPrefix}/user-${userId}/generation-${generationId}/${fileName}`;

    return {
      content: decodeBase64Image(image),
      directory: join(this.storageRoot, relativeDir),
      diskPath: join(this.storageRoot, relativeDir, fileName),
      publicPath
    };
  }

  // 写入单张图片文件
  async #writeImageItem(item) {
    await mkdir(item.directory, { recursive: true });
    await writeFile(item.diskPath, item.content);
  }
}

// 解码 data URL 或纯 base64 图片内容
function decodeBase64Image(image) {
  const value = String(image ?? "");
  const base64 = value.includes(",") ? value.split(",").pop() : value;

  return Buffer.from(base64, "base64");
}
