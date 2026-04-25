import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  ImageStorageService,
  createImageStorageConfig
} from "../src/services/imageStorageService.mjs";

test("createImageStorageConfig stores macOS images under project storage", () => {
  const config = createImageStorageConfig({
    platform: "darwin",
    projectRoot: "/project"
  });

  assert.equal(config.storageRoot, "/project/storage/kimo-images");
  assert.equal(config.publicPrefix, "/generated-images");
});

test("createImageStorageConfig stores Linux images under /opt/kimo-images", () => {
  const config = createImageStorageConfig({
    platform: "linux",
    projectRoot: "/project"
  });

  assert.equal(config.storageRoot, "/opt/kimo-images");
});

test("ImageStorageService saves base64 images and returns server relative paths", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "kimo-images-"));
  const service = new ImageStorageService({
    storageRoot,
    publicPrefix: "/generated-images"
  });
  const base64Image = "data:image/png;base64,aGVsbG8=";

  try {
    const paths = await service.saveGenerationImages({
      userId: 7,
      generationId: 11,
      images: [base64Image]
    });

    assert.deepEqual(paths, ["/generated-images/user-7/generation-11/image-1.png"]);
    const saved = await readFile(join(storageRoot, "user-7", "generation-11", "image-1.png"), "utf8");
    assert.equal(saved, "hello");
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});
