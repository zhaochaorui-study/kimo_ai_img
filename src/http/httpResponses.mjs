// 发送 JSON 响应，统一后端接口输出格式
export function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);

  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

// 发送接口成功响应，避免每个路由重复包装结构
export function sendOk(response, payload = {}) {
  sendJson(response, 200, { ok: true, ...payload });
}

// 发送接口错误响应，统一错误消息字段
export function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { ok: false, message });
}

// 读取请求体 JSON，并限制请求体大小防止滥用
export async function readJsonBody(request, maxBytes = 8 * 1024 * 1024) {
  const rawBody = await readRequestBody(request, maxBytes);

  if (!rawBody.trim()) {
    return {};
  }

  return JSON.parse(rawBody);
}

// 读取原始请求体，超过限制时提前失败
function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let receivedBytes = 0;

    request.on("data", (chunk) => {
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) reject(new Error("请求体过大"));
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}
