import { BillingAction, CreditAmount, PricingPolicy } from "../domain/billing.mjs";
import { GenerationMode, GenerationRequest } from "../generation.mjs";

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
  }

  // 执行文生图任务
  async createTextImages(userId, input) {
    const request = this.#createGenerationRequest(GenerationMode.TextToImage, input);
    const generation = this.#createGenerationRecord(userId, request);
    const charge = await this.walletService.spendAndCreateGeneration(userId, generation);

    return this.#completeRemoteGeneration(userId, charge.generationId, generation, request);
  }

  // 执行图文生图任务
  async createImageEdits(userId, input) {
    const request = this.#createGenerationRequest(GenerationMode.ImagePrompt, input);
    const generation = this.#createGenerationRecord(userId, request);
    const charge = await this.walletService.spendAndCreateGeneration(userId, generation);

    return this.#completeRemoteEdit(userId, charge.generationId, generation, request, input);
  }

  // 查询用户生成历史
  async listHistory(userId) {
    return this.generationRepository.listByUser(userId);
  }

  // 查询公开画廊
  async listPublic() {
    return this.generationRepository.listPublic();
  }

  // 删除用户自己的历史记录
  async deleteHistoryItem(userId, generationId) {
    const deleted = await this.generationRepository.deleteByUser(userId, generationId);

    if (!deleted) {
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
      costCents: cost.toCents(),
      isPublic: request.isPublic,
      referenceImageName: request.imageName
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

  // 保存远端返回图片到本地磁盘，业务层只继续处理服务器相对路径
  async #saveGeneratedImages(userId, generationId, images) {
    return this.imageStorageService.saveGenerationImages({
      userId,
      generationId,
      images
    });
  }
}
