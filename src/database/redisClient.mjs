import { Socket } from "node:net";

const DEFAULT_REDIS_TIMEOUT_MS = 5000;

// 创建 Redis 客户端并完成本地连接初始化
export async function createRedisClient(config) {
  const client = new RedisClient(config);

  // 调用 Redis 连接初始化，提前暴露本地 Redis 不可用的问题
  await client.connect();

  return client;
}

// Redis 客户端，封装会话存储需要的最小命令集合
export class RedisClient {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pendingReplies = [];
  }

  // 建立 Redis TCP 连接并选择数据库
  async connect() {
    if (this.socket) return;
    this.socket = await this.#createConnectedSocket();
    this.#bindSocketEvents();

    // 调用 Redis 认证，兼容本地无密码 Redis
    if (this.config.password) {
      await this.#sendCommand(["AUTH", this.config.password]);
    }

    // 调用 Redis SELECT，隔离会话数据所在数据库
    if (Number(this.config.db) > 0) {
      await this.#sendCommand(["SELECT", String(this.config.db)]);
    }
  }

  // 写入带 TTL 的字符串值
  async setEx(key, ttlSeconds, value) {
    await this.#sendCommand(["SET", key, value, "EX", String(ttlSeconds)]);
  }

  // 读取字符串值，不存在时返回空
  async get(key) {
    return this.#sendCommand(["GET", key]);
  }

  // 删除字符串值
  async del(key) {
    await this.#sendCommand(["DEL", key]);
  }

  // 关闭 Redis 连接
  async close() {
    if (!this.socket) return;
    this.socket.end();
    this.socket = null;
  }

  // 创建已经连接到 Redis 的 Socket
  async #createConnectedSocket() {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("连接 Redis 超时"));
      }, DEFAULT_REDIS_TIMEOUT_MS);

      socket.once("error", reject);
      socket.connect(this.config.port, this.config.host, () => {
        clearTimeout(timer);
        socket.off("error", reject);
        resolve(socket);
      });
    });
  }

  // 绑定 Socket 数据和异常事件
  #bindSocketEvents() {
    this.socket.on("data", (chunk) => this.#handleData(chunk));
    this.socket.on("error", (error) => this.#rejectPendingReplies(error));
    this.socket.on("close", () => this.#rejectPendingReplies(new Error("Redis 连接已关闭")));
  }

  // 发送 Redis 命令并等待响应
  async #sendCommand(parts) {
    return new Promise((resolve, reject) => {
      this.pendingReplies.push({ resolve, reject });
      this.socket.write(encodeRedisCommand(parts));
    });
  }

  // 处理 Redis 返回数据，按 RESP 协议解析响应
  #handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.pendingReplies.length) {
      const parsed = parseRedisReply(this.buffer);
      if (!parsed) return;
      this.buffer = this.buffer.subarray(parsed.offset);
      this.#resolveNextReply(parsed.value);
    }
  }

  // 完成队列中的下一个 Redis 响应
  #resolveNextReply(value) {
    const pending = this.pendingReplies.shift();
    if (value instanceof Error) {
      pending.reject(value);
      return;
    }

    pending.resolve(value);
  }

  // 拒绝所有等待中的 Redis 响应
  #rejectPendingReplies(error) {
    while (this.pendingReplies.length) {
      this.pendingReplies.shift().reject(error);
    }
  }
}

// 编码 Redis RESP 数组命令
function encodeRedisCommand(parts) {
  const body = parts
    .map((part) => {
      const value = String(part);
      return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
    })
    .join("");

  return `*${parts.length}\r\n${body}`;
}

// 解析 Redis RESP 响应
function parseRedisReply(buffer) {
  if (!buffer.length) return null;
  const type = String.fromCharCode(buffer[0]);

  if (type === "+") return parseSimpleString(buffer);
  if (type === "-") return parseRedisError(buffer);
  if (type === ":") return parseInteger(buffer);
  if (type === "$") return parseBulkString(buffer);

  throw new Error("未知 Redis 响应格式");
}

// 解析 Redis 简单字符串
function parseSimpleString(buffer) {
  const line = readLine(buffer, 1);
  if (!line) return null;
  return { value: line.value, offset: line.offset };
}

// 解析 Redis 错误响应
function parseRedisError(buffer) {
  const line = readLine(buffer, 1);
  if (!line) return null;
  return { value: new Error(line.value), offset: line.offset };
}

// 解析 Redis 整数响应
function parseInteger(buffer) {
  const line = readLine(buffer, 1);
  if (!line) return null;
  return { value: Number(line.value), offset: line.offset };
}

// 解析 Redis Bulk String 响应
function parseBulkString(buffer) {
  const line = readLine(buffer, 1);
  if (!line) return null;
  const length = Number(line.value);
  if (length < 0) return { value: null, offset: line.offset };
  const endOffset = line.offset + length;
  if (buffer.length < endOffset + 2) return null;
  return {
    value: buffer.subarray(line.offset, endOffset).toString("utf8"),
    offset: endOffset + 2
  };
}

// 读取 CRLF 结尾的一行
function readLine(buffer, startOffset) {
  const endOffset = buffer.indexOf("\r\n", startOffset, "utf8");
  if (endOffset < 0) return null;
  return {
    value: buffer.subarray(startOffset, endOffset).toString("utf8"),
    offset: endOffset + 2
  };
}
