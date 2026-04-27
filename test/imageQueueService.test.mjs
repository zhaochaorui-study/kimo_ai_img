import test from "node:test";
import assert from "node:assert/strict";

import { ImageService } from "../src/services/imageService.mjs";

test("ImageService queues new generation when global active limit is reached", async () => {
  const dependencies = createQueueDependencies({ processingCount: 2 });
  const service = createQueueImageService(dependencies);

  const result = await service.createTextImages(7, createTextGenerationInput());

  assert.deepEqual(result, { generationId: 21, status: "pending", queuePosition: 1 });
  assert.deepEqual(dependencies.generationRepository.processingIds, []);
  assert.equal(dependencies.remoteImageClient.textCalls.length, 0);
});

test("ImageService starts a queued generation when global active capacity is available", async () => {
  const dependencies = createQueueDependencies({ processingCount: 1 });
  const service = createQueueImageService(dependencies);

  const result = await service.createTextImages(7, createTextGenerationInput());

  assert.deepEqual(result, { generationId: 21, status: "processing", queuePosition: null });
  assert.deepEqual(dependencies.generationRepository.processingIds, [21]);
  assert.equal(dependencies.remoteImageClient.textCalls.length, 1);
});

// 创建带队列依赖的图片服务，隔离并发调度测试装配
function createQueueImageService(dependencies) {
  return new ImageService({
    generationRepository: dependencies.generationRepository,
    walletService: dependencies.walletService,
    remoteImageClient: dependencies.remoteImageClient,
    imageStorageService: dependencies.imageStorageService,
    textToImageUnitCostCents: 10,
    imageEditUnitCostCents: 10,
    maxConcurrentGenerations: 2
  });
}

// 创建队列测试依赖对象，集中管理内存仓储和外部服务替身
function createQueueDependencies(options) {
  const generationRepository = new MemoryGenerationRepository(options);

  return {
    generationRepository,
    walletService: new MemoryWalletService(generationRepository),
    remoteImageClient: new MemoryRemoteImageClient(),
    imageStorageService: new MemoryImageStorageService()
  };
}

// 创建文生图输入对象，避免测试重复铺参数
function createTextGenerationInput() {
  return {
    prompt: "a neon product photo",
    modelName: "Kimo Image",
    ratio: "1:1",
    quantity: 1,
    isPublic: false
  };
}

class MemoryGenerationRepository {
  constructor(options) {
    this.processingCount = options.processingCount;
    this.processingIds = [];
    this.succeededIds = [];
    this.pendingPosition = 1;
  }

  // 查询用户是否有测试中的运行任务
  async hasPendingOrProcessing() {
    return false;
  }

  // 查询全局处理中任务数量
  async countProcessing() {
    return this.processingCount;
  }

  // 查询待处理任务当前排队位次
  async countPendingBefore() {
    return this.pendingPosition;
  }

  // 标记任务进入处理状态
  async markProcessing(generationId) {
    this.processingIds.push(generationId);
    this.processingCount += 1;
    return true;
  }

  // 标记任务生成成功
  async markSucceeded(generationId) {
    this.succeededIds.push(generationId);
    this.processingCount -= 1;
  }
}

class MemoryWalletService {
  constructor(generationRepository) {
    this.generationRepository = generationRepository;
  }

  // 扣费并创建待处理生成记录
  async spendAndCreateGeneration(userId, generation) {
    this.generation = generation;
    this.userId = userId;
    return { generationId: 21, balanceCents: 90 };
  }
}

class MemoryRemoteImageClient {
  constructor() {
    this.textCalls = [];
  }

  // 记录文生图远端调用
  async createTextImages(generation) {
    this.textCalls.push(generation);
    return ["image-data"];
  }
}

class MemoryImageStorageService {
  // 保存测试生成图片并返回路径
  async saveGenerationImages() {
    return ["/generated-images/user-7/generation-21/image-1.png"];
  }
}
