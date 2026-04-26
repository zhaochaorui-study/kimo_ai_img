import { randomInt } from "node:crypto";
import { assertAllowedRegisterEmailDomain } from "../security/emailPolicy.mjs";

const DEFAULT_CODE_TTL_SECONDS = 300;
const DEFAULT_CODE_PREFIX = "create_img_web:verify_code:";
const DEFAULT_COOLDOWN_PREFIX = "create_img_web:verify_cooldown:";
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// 验证码服务，基于 Redis 存储和校验，支持真实邮件发送
export class VerificationService {
  constructor(input) {
    this.redisClient = input.redisClient;
    this.emailService = input.emailService ?? null;
    this.codeTtlSeconds = input.codeTtlSeconds ?? DEFAULT_CODE_TTL_SECONDS;
    this.codePrefix = input.codePrefix ?? DEFAULT_CODE_PREFIX;
    this.cooldownPrefix = input.cooldownPrefix ?? DEFAULT_COOLDOWN_PREFIX;
    this.cooldownSeconds = input.cooldownSeconds ?? 60;
  }

  // 发送验证码到指定邮箱，返回剩余冷却秒数
  async sendCode(email) {
    const normalizedEmail = this.#normalizeEmail(email);
    this.#validateEmail(normalizedEmail);

    // 调用邮箱白名单校验，避免向非目标邮箱发送注册验证码
    assertAllowedRegisterEmailDomain(normalizedEmail);

    const cooldownKey = this.#cooldownKey(normalizedEmail);
    const remainingCooldown = await this.#getRemainingCooldown(cooldownKey);

    if (remainingCooldown > 0) {
      return { success: false, remainingSeconds: remainingCooldown };
    }

    const code = this.#generateCode();
    const codeKey = this.#codeKey(normalizedEmail);

    await this.redisClient.setEx(codeKey, this.codeTtlSeconds, code);
    await this.redisClient.setEx(cooldownKey, this.cooldownSeconds, "1");

    if (this.emailService) {
      await this.emailService.sendVerificationCode(normalizedEmail, code);
    } else {
      console.log(`[验证码] ${normalizedEmail}: ${code}`);
    }

    return { success: true, remainingSeconds: this.cooldownSeconds };
  }

  // 校验邮箱验证码是否正确
  async verifyCode(email, code) {
    const normalizedEmail = this.#normalizeEmail(email);
    const normalizedCode = this.#normalizeCode(code);
    this.#validateEmail(normalizedEmail);

    if (!normalizedCode || normalizedCode.length !== 6) {
      throw new Error("验证码格式错误");
    }

    const codeKey = this.#codeKey(normalizedEmail);
    const storedCode = await this.redisClient.get(codeKey);

    if (!storedCode) {
      throw new Error("验证码已过期，请重新获取");
    }

    if (storedCode !== normalizedCode) {
      throw new Error("验证码错误");
    }

    // 验证成功后删除验证码，防止重复使用
    await this.redisClient.del(codeKey);
    return true;
  }

  // 规范化邮箱地址
  #normalizeEmail(email) {
    return String(email ?? "").trim().toLowerCase();
  }

  // 规范化验证码，避免复制或输入法带空格导致误判
  #normalizeCode(code) {
    return String(code ?? "").trim();
  }

  // 校验邮箱格式
  #validateEmail(email) {
    if (!EMAIL_PATTERN.test(email)) {
      throw new Error("请输入有效的邮箱地址");
    }
  }

  // 生成6位数字验证码
  #generateCode() {
    return String(randomInt(100000, 999999));
  }

  // 获取剩余冷却时间（秒）
  async #getRemainingCooldown(key) {
    const ttl = await this.redisClient.ttl(key);
    return Math.max(0, ttl);
  }

  // 创建验证码 Redis 键
  #codeKey(email) {
    return `${this.codePrefix}${email}`;
  }

  // 创建冷却期 Redis 键
  #cooldownKey(email) {
    return `${this.cooldownPrefix}${email}`;
  }
}
