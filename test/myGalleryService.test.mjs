import test from "node:test";
import assert from "node:assert/strict";

import { ImageService } from "../src/services/imageService.mjs";

// 创建只包含画廊依赖的图片服务，聚焦测试公开标识流转
function createGalleryService(generationRepository) {
  return new ImageService({
    generationRepository,
    walletService: {},
    remoteImageClient: {},
    imageStorageService: {},
    textToImageUnitCostCents: 10,
    imageEditUnitCostCents: 10
  });
}

test("ImageService lists current user's public gallery items", async () => {
  const repository = {
    listPublicByUser: async (userId) => [{ id: 7, userId, isPublic: true }]
  };
  const service = createGalleryService(repository);

  const items = await service.listMyGallery(3);

  assert.deepEqual(items, [{ id: 7, userId: 3, isPublic: true }]);
});

test("ImageService removes current user's gallery flag without deleting history", async () => {
  const calls = [];
  const repository = {
    removeFromPublicByUser: async (userId, generationId) => {
      calls.push({ userId, generationId });
      return true;
    }
  };
  const service = createGalleryService(repository);

  await service.removeFromMyGallery(3, 7);

  assert.deepEqual(calls, [{ userId: 3, generationId: 7 }]);
});

test("ImageService rejects removing a missing gallery item", async () => {
  const repository = {
    removeFromPublicByUser: async () => false
  };
  const service = createGalleryService(repository);

  await assert.rejects(() => service.removeFromMyGallery(3, 404), /画廊记录不存在/);
});
