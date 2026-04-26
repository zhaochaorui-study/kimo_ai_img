import test from "node:test";
import assert from "node:assert/strict";

import { VerificationService } from "../src/services/verificationService.mjs";

test("VerificationService stores register code in Redis for five minutes", async () => {
  const redisClient = new MemoryRedisClient();
  const emailService = new MemoryEmailService();
  const service = new VerificationService({
    redisClient,
    emailService,
    codePrefix: "test:code:",
    cooldownPrefix: "test:cooldown:"
  });

  const result = await service.sendCode("User@qq.com");

  assert.deepEqual(result, { success: true, remainingSeconds: 60 });
  assert.equal(redisClient.records.get("test:code:user@qq.com").ttlSeconds, 300);
  assert.equal(redisClient.records.get("test:cooldown:user@qq.com").ttlSeconds, 60);
  assert.match(emailService.messages[0].code, /^\d{6}$/);
});

test("VerificationService verifies Redis code once and deletes it after success", async () => {
  const redisClient = new MemoryRedisClient();
  const service = new VerificationService({
    redisClient,
    codePrefix: "test:code:",
    cooldownPrefix: "test:cooldown:"
  });

  await redisClient.setEx("test:code:user@example.com", 300, "123456");

  await service.verifyCode("USER@example.com", " 123456 ");

  assert.equal(await redisClient.get("test:code:user@example.com"), null);
});

test("VerificationService rejects mismatched Redis code", async () => {
  const redisClient = new MemoryRedisClient();
  const service = new VerificationService({
    redisClient,
    codePrefix: "test:code:",
    cooldownPrefix: "test:cooldown:"
  });

  await redisClient.setEx("test:code:user@example.com", 300, "123456");

  await assert.rejects(
    () => service.verifyCode("user@example.com", "654321"),
    /验证码错误/
  );
});

test("VerificationService rejects unsupported email domains before sending code", async () => {
  const redisClient = new MemoryRedisClient();
  const emailService = new MemoryEmailService();
  const service = new VerificationService({
    redisClient,
    emailService,
    codePrefix: "test:code:",
    cooldownPrefix: "test:cooldown:"
  });

  await assert.rejects(
    () => service.sendCode("user@example.com"),
    /仅支持 Gmail、QQ 邮箱和 163 邮箱注册/
  );

  assert.equal(emailService.messages.length, 0);
  assert.equal(redisClient.records.size, 0);
});

test("VerificationService allows Gmail QQ and 163 email domains", async () => {
  const redisClient = new MemoryRedisClient();
  const emailService = new MemoryEmailService();
  const service = new VerificationService({
    redisClient,
    emailService,
    codePrefix: "test:code:",
    cooldownPrefix: "test:cooldown:"
  });

  await service.sendCode("user@gmail.com");
  await service.sendCode("user@qq.com");
  await service.sendCode("user@163.com");

  assert.equal(emailService.messages.length, 3);
});

class MemoryEmailService {
  constructor() {
    this.messages = [];
  }

  // 记录发送出去的验证码，便于测试验证码来源
  async sendVerificationCode(toEmail, code) {
    this.messages.push({ toEmail, code });
  }
}

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

  // 查询 Redis 键剩余生存时间
  async ttl(key) {
    return this.records.get(key)?.ttlSeconds ?? -2;
  }
}
