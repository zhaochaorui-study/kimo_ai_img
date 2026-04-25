import { randomUUID } from "node:crypto";

const DEFAULT_SESSION_KEY_PREFIX = "create_img_web:session:";

// Redis 会话存储，负责签发、校验和销毁登录会话
export class RedisSessionStore {
  constructor(input) {
    this.redisClient = input.redisClient;
    this.keyPrefix = input.keyPrefix ?? DEFAULT_SESSION_KEY_PREFIX;
    this.ttlSeconds = input.ttlSeconds;
  }

  // 签发不含用户信息的随机会话令牌，并把会话写入 Redis
  async issue(user) {
    const token = randomUUID();
    const session = this.#createSessionPayload(user);

    // 调用 Redis 写入会话，保证后续请求必须依赖服务端会话状态
    await this.redisClient.setEx(this.#createSessionKey(token), this.ttlSeconds, JSON.stringify(session));

    return token;
  }

  // 校验会话令牌并返回 Redis 中保存的用户身份
  async verify(token) {
    const sessionValue = await this.redisClient.get(this.#createSessionKey(token));

    if (!sessionValue) {
      throw new Error("登录已失效，请重新登录");
    }

    return this.#parseSessionValue(sessionValue);
  }

  // 销毁会话令牌，用于退出登录或服务端主动失效
  async destroy(token) {
    await this.redisClient.del(this.#createSessionKey(token));
  }

  // 创建 Redis 会话键
  #createSessionKey(token) {
    const safeToken = String(token ?? "").trim();
    if (!safeToken) {
      throw new Error("登录已失效，请重新登录");
    }

    return `${this.keyPrefix}${safeToken}`;
  }

  // 创建会话载荷，统一 Redis 中保存的数据形态
  #createSessionPayload(user) {
    return {
      userId: Number(user.id),
      username: user.username,
      issuedAt: Date.now()
    };
  }

  // 解析 Redis 会话内容，坏数据按登录失效处理
  #parseSessionValue(value) {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error("登录已失效，请重新登录");
    }
  }
}
