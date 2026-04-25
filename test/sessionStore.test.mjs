import test from "node:test";
import assert from "node:assert/strict";

import { RedisSessionStore } from "../src/security/sessions.mjs";

test("RedisSessionStore stores opaque session token in Redis", async () => {
  const redisClient = new MemoryRedisClient();
  const sessionStore = new RedisSessionStore({
    redisClient,
    keyPrefix: "test:session:",
    ttlSeconds: 60
  });

  const token = await sessionStore.issue({ id: 7, username: "alice" });
  const session = await sessionStore.verify(token);

  assert.equal(session.userId, 7);
  assert.equal(session.username, "alice");
  assert.equal(redisClient.records.get(`test:session:${token}`).ttlSeconds, 60);
  assert.doesNotMatch(token, /alice|userId/);
});

test("RedisSessionStore rejects missing session token", async () => {
  const sessionStore = new RedisSessionStore({
    redisClient: new MemoryRedisClient(),
    keyPrefix: "test:session:",
    ttlSeconds: 60
  });

  await assert.rejects(
    () => sessionStore.verify("missing-token"),
    /登录已失效/
  );
});

test("RedisSessionStore destroys session token", async () => {
  const redisClient = new MemoryRedisClient();
  const sessionStore = new RedisSessionStore({
    redisClient,
    keyPrefix: "test:session:",
    ttlSeconds: 60
  });
  const token = await sessionStore.issue({ id: 8, username: "bob" });

  await sessionStore.destroy(token);

  await assert.rejects(
    () => sessionStore.verify(token),
    /登录已失效/
  );
});

class MemoryRedisClient {
  constructor() {
    this.records = new Map();
  }

  // 写入带过期时间的 Redis 字符串值
  async setEx(key, ttlSeconds, value) {
    this.records.set(key, { ttlSeconds, value });
  }

  // 读取 Redis 字符串值
  async get(key) {
    return this.records.get(key)?.value ?? null;
  }

  // 删除 Redis 字符串值
  async del(key) {
    this.records.delete(key);
  }
}
