import { BillingAction, CreditAmount, PricingPolicy } from "../domain/billing.mjs";
import { GenerationMode, GenerationRequest } from "../generation.mjs";

const DEFAULT_MAX_CONCURRENT_GENERATIONS = 2;

// 图片生成服务，串联扣费、远端调用、历史落库和失败退款
export class ImageService {
  constructor(input) {
    this.walletService = input.walletService;
    this.generationRepository = input.generationRepository;
    this.remoteImageClient = input.remoteImageClient;
    this.imageStorageService = input.imageStorageService;
    this.pricingPolicy = new PricingPolicy({
      textToImageUnitCost: CreditAmount.fromCents(input.textToImageUnitCostCents),
      imageEditUnitCost: CreditAmount.fromCents(input.imageEditUnitCostCents)
    });
    this.maxConcurrentGenerations = input.maxConcurrentGenerations ?? DEFAULT_MAX_CONCURRENT_GENERATIONS;
    this.queuedGenerations = new Map();
    this.dispatchingQueue = false;
  }

  // 创建文生图任务并交给全局队列调度
  async createTextImages(userId, input) {
    return this.#queueGeneration(userId, GenerationMode.TextToImage, input);
  }

  // 创建图文生图任务并交给全局队列调度
  async createImageEdits(userId, input) {
    return this.#queueGeneration(userId, GenerationMode.ImagePrompt, input);
  }

  // 查询用户生成历史
  async listHistory(userId) {
    return this.generationRepository.listByUser(userId);
  }

  // 查询公开画廊
  async listPublic() {
    return this.generationRepository.listPublic();
  }

  // 查询当前用户已加入公共画廊的图片
  async listMyGallery(userId) {
    return this.generationRepository.listPublicByUser(userId);
  }

  // 将当前用户的图片移出公共画廊，保留历史记录
  async removeFromMyGallery(userId, generationId) {
    const removed = await this.generationRepository.removeFromPublicByUser(userId, generationId);

    if (!removed) {
      throw new Error("画廊记录不存在");
    }
  }

  // 删除用户自己的历史记录
  async deleteHistoryItem(userId, generationId) {
    const deleted = await this.generationRepository.deleteByUser(userId, generationId);

    if (!deleted) {
      throw new Error("历史记录不存在");
    }
  }

  // 切换历史记录的公开状态（加入/移出画廊）
  async togglePublic(userId, generationId) {
    const toggled = await this.generationRepository.togglePublicByUser(userId, generationId);

    if (!toggled) {
      throw new Error("历史记录不存在");
    }
  }

  // 创建生成请求对象
  #createGenerationRequest(mode, input) {
    return new GenerationRequest({
      ...input,
      mode,
      model: input.modelName
    });
  }

  // 创建生成记录对象，后续用于事务落库
  #createGenerationRecord(userId, request) {
    const action = request.mode === GenerationMode.ImagePrompt ? BillingAction.ImageEdit : BillingAction.TextToImage;
    const cost = this.pricingPolicy.calculateCost(action, request.quantity);

    return {
      userId,
      mode: request.mode,
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      modelName: request.modelName ?? "Aurora XL v2",
      styleName: request.style,
      ratio: request.ratio,
      quantity: request.quantity,
      quality: request.quality,
      outputFormat: request.outputFormat,
      outputCompression: request.outputCompression,
      costCents: cost.toCents(),
      isPublic: request.isPublic,
      referenceImageName: request.imageName
    };
  }

  // 创建待处理生成任务，并返回当前队列状态
  async #queueGeneration(userId, mode, input) {
    await this.#assertNoRunningGeneration(userId);

    const request = this.#createGenerationRequest(mode, input);
    const generation = this.#createGenerationRecord(userId, request);
    const charge = await this.walletService.spendAndCreateGeneration(userId, generation);

    this.#rememberQueuedGeneration(charge.generationId, { userId, generation, request, input });

    // 调用队列调度器，尽快把有容量的任务推进到处理中
    const startedIds = await this.#dispatchQueuedGenerations();

    return this.#createQueuePayload(charge, startedIds);
  }

  // 暂存队列任务上下文，保留图文生图的参考图数据用于后台消费
  #rememberQueuedGeneration(generationId, queuedGeneration) {
    this.queuedGenerations.set(generationId, queuedGeneration);
  }

  // 调度待处理任务，保证全局同时处理数量不超过配置上限
  async #dispatchQueuedGenerations() {
    if (this.dispatchingQueue) return new Set();

    this.dispatchingQueue = true;
    const startedIds = new Set();

    try {
      await this.#startQueuedGenerations(startedIds);
      return startedIds;
    } finally {
      this.dispatchingQueue = false;
    }
  }

  // 按入队顺序启动有容量的任务
  async #startQueuedGenerations(startedIds) {
    let availableSlots = await this.#countAvailableSlots();

    for (const [generationId, queuedGeneration] of this.queuedGenerations) {
      if (availableSlots <= 0) return;

      // 调用状态流转，只有仍处于 pending 的任务才允许进入处理
      const started = await this.generationRepository.markProcessing(generationId);
      if (!started) continue;

      startedIds.add(generationId);
      availableSlots -= 1;
      this.#processQueuedGeneration(generationId, queuedGeneration);
    }
  }

  // 计算当前可用处理槽位
  async #countAvailableSlots() {
    const processingCount = await this.generationRepository.countProcessing();
    return Math.max(0, this.maxConcurrentGenerations - processingCount);
  }

  // 后台执行已进入 processing 的生成任务，完成后继续唤醒队列
  #processQueuedGeneration(generationId, queuedGeneration) {
    this.#runQueuedGeneration(generationId, queuedGeneration)
      .catch(() => {})
      .finally(() => {
        this.queuedGenerations.delete(generationId);
        this.#dispatchQueuedGenerations();
      });
  }

  // 执行单个队列任务，根据生成模式选择远端调用
  async #runQueuedGeneration(generationId, queuedGeneration) {
    if (queuedGeneration.request.mode === GenerationMode.ImagePrompt) {
      await this.#completeRemoteEdit(
        queuedGeneration.userId,
        generationId,
        queuedGeneration.generation,
        queuedGeneration.request,
        queuedGeneration.input
      );
      return;
    }

    await this.#completeRemoteGeneration(
      queuedGeneration.userId,
      generationId,
      queuedGeneration.generation,
      queuedGeneration.request
    );
  }

  // 创建生成提交后的队列响应
  async #createQueuePayload(charge, startedIds) {
    const basePayload = {
      generationId: charge.generationId,
      balanceCents: charge.balanceCents
    };

    if (startedIds.has(charge.generationId)) {
      return { ...basePayload, status: "processing", queuePosition: null };
    }

    return {
      ...basePayload,
      status: "pending",
      queuePosition: await this.generationRepository.countPendingBefore(charge.generationId)
    };
  }

  // 完成文生图远端调用并落库
  async #completeRemoteGeneration(userId, generationId, generation, request) {
    try {
      const images = await this.remoteImageClient.createTextImages(generation);
      const imagePaths = await this.#saveGeneratedImages(userId, generationId, images);
      await this.generationRepository.markSucceeded(generationId, imagePaths);

      return { generationId, images: imagePaths };
    } catch (error) {
      await this.#refundFailedGeneration(userId, generationId, generation.costCents, error);
      throw error;
    }
  }

  // 完成图文生图远端调用并落库
  async #completeRemoteEdit(userId, generationId, generation, request, input) {
    try {
      const images = await this.remoteImageClient.createImageEdits({ ...generation, referenceImage: input.referenceImage });
      const imagePaths = await this.#saveGeneratedImages(userId, generationId, images);
      await this.generationRepository.markSucceeded(generationId, imagePaths);

      return { generationId, images: imagePaths };
    } catch (error) {
      await this.#refundFailedGeneration(userId, generationId, generation.costCents, error);
      throw error;
    }
  }

  // 失败时标记任务并返还扣减额度
  async #refundFailedGeneration(userId, generationId, costCents, error) {
    await this.walletService.refundGeneration(userId, generationId, costCents, error.message);
  }

  // 校验用户当前没有进行中的生成任务
  async #assertNoRunningGeneration(userId) {
    const hasRunning = await this.generationRepository.hasPendingOrProcessing(userId);
    if (hasRunning) {
      throw new Error("您有正在生成的图片，请稍后再试");
    }
  }

  // 保存远端返回图片到本地磁盘，业务层只继续处理服务器相对路径
  async #saveGeneratedImages(userId, generationId, images) {
    return this.imageStorageService.saveGenerationImages({
      userId,
      generationId,
      images
    });
  }
}
