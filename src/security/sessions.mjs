import { createHmac } from "node:crypto";

// 会话签名器，负责签发和校验本地登录令牌
export class SessionSigner {
  constructor(secret) {
    this.secret = secret;
  }

  // 签发用户令牌，浏览器后续通过 Authorization 传回
  issue(user) {
    const payload = encodeBase64Url(JSON.stringify({
      userId: user.id,
      username: user.username,
      issuedAt: Date.now()
    }));

    return `${payload}.${this.#sign(payload)}`;
  }

  // 校验令牌签名并解析用户身份
  verify(token) {
    const [payload, signature] = String(token ?? "").split(".");

    if (!payload || !signature || this.#sign(payload) !== signature) {
      throw new Error("登录已失效，请重新登录");
    }

    return JSON.parse(decodeBase64Url(payload));
  }

  // 为令牌载荷生成 HMAC 签名
  #sign(payload) {
    return createHmac("sha256", this.secret).update(payload).digest("base64url");
  }
}

// 编码 URL 安全的 base64 字符串
function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

// 解码 URL 安全的 base64 字符串
function decodeBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}
