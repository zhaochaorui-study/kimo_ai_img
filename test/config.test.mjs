import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createAppConfig,
  createConfigEnvironment
} from "../src/config.mjs";

test("createConfigEnvironment loads request secrets from env file", async () => {
  const envFilePath = await createTemporaryEnvFile([
    "KIMO_API_KEY=local-secret",
    "KIMO_GENERATION_URL=https://example.test/v1/images/generations",
    "KIMO_EDIT_URL=https://example.test/v1/images/edits"
  ]);

  const configEnvironment = createConfigEnvironment({
    envFilePath,
    runtimeEnv: Object.freeze({})
  });
  const appConfig = createAppConfig(configEnvironment);

  assert.equal(appConfig.imageApi.key, "local-secret");
  assert.equal(appConfig.imageApi.generationUrl, "https://example.test/v1/images/generations");
  assert.equal(appConfig.imageApi.editUrl, "https://example.test/v1/images/edits");
});

test("createConfigEnvironment keeps runtime variables ahead of env file values", async () => {
  const envFilePath = await createTemporaryEnvFile([
    "KIMO_API_KEY=file-secret",
    "KIMO_GENERATION_URL=https://file.example.test/generations"
  ]);

  const configEnvironment = createConfigEnvironment({
    envFilePath,
    runtimeEnv: Object.freeze({
      KIMO_API_KEY: "runtime-secret",
      KIMO_GENERATION_URL: "https://runtime.example.test/generations"
    })
  });
  const appConfig = createAppConfig(configEnvironment);

  assert.equal(appConfig.imageApi.key, "runtime-secret");
  assert.equal(appConfig.imageApi.generationUrl, "https://runtime.example.test/generations");
});

test("createAppConfig derives image endpoints from local API base URL", () => {
  const appConfig = createAppConfig(Object.freeze({
    KIMO_API_BASE_URL: "http://127.0.0.1:3000"
  }));

  assert.equal(appConfig.imageApi.generationUrl, "http://127.0.0.1:3000/v1/images/generations");
  assert.equal(appConfig.imageApi.editUrl, "http://127.0.0.1:3000/v1/images/edits");
});

test("createAppConfig keeps explicit image endpoints ahead of API base URL", () => {
  const appConfig = createAppConfig(Object.freeze({
    KIMO_API_BASE_URL: "http://127.0.0.1:3000",
    KIMO_GENERATION_URL: "http://127.0.0.1:4000/custom/generations",
    KIMO_EDIT_URL: "http://127.0.0.1:4000/custom/edits"
  }));

  assert.equal(appConfig.imageApi.generationUrl, "http://127.0.0.1:4000/custom/generations");
  assert.equal(appConfig.imageApi.editUrl, "http://127.0.0.1:4000/custom/edits");
});

test("createAppConfig exposes image API timeout and retry settings", () => {
  const appConfig = createAppConfig(Object.freeze({
    KIMO_API_TIMEOUT_MS: "120000",
    KIMO_API_MAX_RETRIES: "2"
  }));

  assert.equal(appConfig.imageApi.timeoutMs, 120000);
  assert.equal(appConfig.imageApi.maxRetries, 2);
});

test("createAppConfig keeps default signup credit and generation cost at ten credits", () => {
  const appConfig = createAppConfig(Object.freeze({}));

  assert.equal(appConfig.signupCreditCents, 50);
  assert.equal(appConfig.textToImageUnitCostCents, 10);
  assert.equal(appConfig.imageEditUnitCostCents, 10);
});

test("createAppConfig uses local Redis as default session storage", () => {
  const appConfig = createAppConfig(Object.freeze({}));

  assert.deepEqual(appConfig.redis, {
    host: "127.0.0.1",
    port: 6379,
    password: "",
    db: 0
  });
  assert.equal(appConfig.sessionTtlSeconds, 7 * 24 * 60 * 60);
});

// 创建临时 .env 文件，隔离配置加载测试
async function createTemporaryEnvFile(lines) {
  const directory = await mkdtemp(join(tmpdir(), "create-img-config-"));
  const envFilePath = join(directory, ".env");
  await writeFile(envFilePath, `${lines.join("\n")}\n`, "utf8");
  return envFilePath;
}
