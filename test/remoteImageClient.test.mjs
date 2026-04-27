import test from "node:test";
import assert from "node:assert/strict";

import { RemoteImageClient } from "../src/services/remoteImageClient.mjs";

test("RemoteImageClient retries transient upstream failures and logs context", async () => {
  const fetchCalls = [];
  const logs = [];
  const client = new RemoteImageClient(createClientConfig(), {
    fetcher: async (url, request) => {
      fetchCalls.push({ url, request });
      if (fetchCalls.length === 1) return createJsonResponse(502, { message: "Upstream request failed" });
      return createJsonResponse(200, { data: [{ b64_json: "aGVsbG8=" }] });
    },
    logger: { warn: (payload) => logs.push(payload), error: (payload) => logs.push(payload) },
    retryDelayMs: 0
  });

  const images = await client.createTextImages(createGenerationInput());

  assert.equal(fetchCalls.length, 2);
  assert.deepEqual(images, ["data:image/png;base64,aGVsbG8="]);
  assert.equal(logs[0].endpointName, "text-to-image");
  assert.equal(logs[0].status, 502);
  assert.equal(logs[0].upstreamUrl, "http://127.0.0.1:3000/v1/images/generations");
});

test("RemoteImageClient surfaces final upstream errors with request context", async () => {
  const logs = [];
  const client = new RemoteImageClient(createClientConfig({ maxRetries: 0 }), {
    fetcher: async () => createJsonResponse(500, { message: "Upstream request failed" }),
    logger: { warn: (payload) => logs.push(payload), error: (payload) => logs.push(payload) }
  });

  await assert.rejects(
    () => client.createTextImages(createGenerationInput()),
    /图片上游请求失败：Upstream request failed/
  );
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, 500);
  assert.match(logs[0].bodyPreview, /Upstream request failed/);
});

test("RemoteImageClient sends quality and compression options to text generation", async () => {
  const fetchCalls = [];
  const client = new RemoteImageClient(createClientConfig(), {
    fetcher: async (url, request) => {
      fetchCalls.push({ url, request });
      return createJsonResponse(200, { data: [{ b64_json: "aGVsbG8=" }] });
    },
    logger: createSilentLogger()
  });

  const images = await client.createTextImages(createGenerationInput({
    quality: "high",
    outputFormat: "webp",
    outputCompression: 72
  }));
  const body = JSON.parse(fetchCalls[0].request.body);

  assert.equal(body.quality, "high");
  assert.equal(body.output_format, "webp");
  assert.equal(body.output_compression, 72);
  assert.deepEqual(images, ["data:image/webp;base64,aGVsbG8="]);
});

test("RemoteImageClient sends quality and compression options to image edits", async () => {
  const fetchCalls = [];
  const client = new RemoteImageClient(createClientConfig(), {
    fetcher: async (url, request) => {
      fetchCalls.push({ url, request });
      return createJsonResponse(200, { data: [{ b64_json: "aGVsbG8=" }] });
    },
    logger: createSilentLogger()
  });

  const images = await client.createImageEdits(createGenerationInput({
    quality: "medium",
    outputFormat: "jpeg",
    outputCompression: 64,
    referenceImage: "data:image/png;base64,aGVsbG8=",
    referenceImageName: "reference.png"
  }));
  const formData = fetchCalls[0].request.body;

  assert.equal(formData.get("quality"), "medium");
  assert.equal(formData.get("output_format"), "jpeg");
  assert.equal(formData.get("output_compression"), "64");
  assert.deepEqual(images, ["data:image/jpeg;base64,aGVsbG8="]);
});

test("RemoteImageClient does not send removed realtime preview options", async () => {
  const fetchCalls = [];
  const client = new RemoteImageClient(createClientConfig(), {
    fetcher: async (url, request) => {
      fetchCalls.push({ url, request });
      return createJsonResponse(200, { data: [{ b64_json: "ZmluYWw=" }] });
    },
    logger: createSilentLogger()
  });

  const images = await client.createTextImages(createGenerationInput({
    stream: true,
    partialImages: 2,
    outputFormat: "webp"
  }));
  const body = JSON.parse(fetchCalls[0].request.body);

  assert.equal(body.stream, undefined);
  assert.equal(body.partial_images, undefined);
  assert.deepEqual(images, ["data:image/webp;base64,ZmluYWw="]);
});

// 创建测试用图片客户端配置
function createClientConfig(overrides = {}) {
  return {
    key: "test-key",
    generationUrl: "http://127.0.0.1:3000/v1/images/generations",
    editUrl: "http://127.0.0.1:3000/v1/images/edits",
    model: "gpt-image-1",
    timeoutMs: 300000,
    maxRetries: 1,
    ...overrides
  };
}

// 创建测试用生成请求
function createGenerationInput(overrides = {}) {
  return {
    prompt: "test prompt",
    quantity: 1,
    ratio: "1:1",
    modelName: "Kimo Image",
    ...overrides
  };
}

// 创建静默日志器，避免测试输出被上游失败日志污染
function createSilentLogger() {
  return {
    warn: () => {},
    error: () => {}
  };
}

// 创建兼容 fetch Response 的 JSON 响应
function createJsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
