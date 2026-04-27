import test from "node:test";
import assert from "node:assert/strict";

import { AuthService, Credentials } from "../src/services/authService.mjs";
import { hashPassword } from "../src/security/passwords.mjs";

const SIGNUP_CREDIT_CENTS = 30;

test("AuthService logs in with email payload from the auth form", async () => {
  const passwordHash = hashPassword("secret123");
  const userRepository = new MemoryUserRepository({
    id: 9,
    username: "user@example.com",
    email: "user@example.com",
    password_hash: passwordHash.hash,
    password_salt: passwordHash.salt,
    balance_cents: SIGNUP_CREDIT_CENTS
  });
  const sessionStore = new MemorySessionStore();
  const service = new AuthService({
    pool: {},
    userRepository,
    sessionStore,
    verificationService: {},
    signupCreditCents: SIGNUP_CREDIT_CENTS
  });

  const result = await service.login(new Credentials({
    email: "USER@example.com",
    password: "secret123"
  }));

  assert.equal(userRepository.lastUsername, "user@example.com");
  assert.equal(result.token, "token-9");
  assert.equal(result.user.email, "user@example.com");
});

test("AuthService rejects unsupported register email domains", async () => {
  const service = createRegisterAuthService();

  await assert.rejects(
    () => service.register(new Credentials({
      email: "user@example.com",
      password: "secret123",
      verificationCode: "123456",
      registerIp: "203.0.113.8"
    })),
    /仅支持 Gmail、QQ 邮箱和 163 邮箱注册/
  );
});

test("AuthService rejects register requests when IP already owns an account", async () => {
  const service = createRegisterAuthService({
    registeredIpUser: { id: 11, email: "old@qq.com" }
  });

  await assert.rejects(
    () => service.register(new Credentials({
      email: "new@qq.com",
      password: "secret123",
      verificationCode: "123456",
      registerIp: "203.0.113.8"
    })),
    /当前网络环境已注册过账号，请勿重复注册/
  );
});

test("AuthService stores register IP when creating user", async () => {
  const userRepository = new MemoryUserRepository(null);
  const service = createRegisterAuthService({ userRepository });

  await service.register(new Credentials({
    email: "user@qq.com",
    password: "secret123",
    verificationCode: "123456",
    registerIp: "203.0.113.8"
  }));

  assert.equal(userRepository.createdAccount.registerIp, "203.0.113.8");
});

test("AuthService gives new users thirty signup credits", async () => {
  const userRepository = new MemoryUserRepository(null);
  const service = createRegisterAuthService({ userRepository });

  const result = await service.register(new Credentials({
    email: "user@qq.com",
    password: "secret123",
    verificationCode: "123456",
    registerIp: "203.0.113.8"
  }));

  assert.equal(result.user.balanceCents, SIGNUP_CREDIT_CENTS);
  assert.equal(userRepository.createdAccount.balanceCents, SIGNUP_CREDIT_CENTS);
  assert.equal(userRepository.createdTransaction.amountCents, SIGNUP_CREDIT_CENTS);
  assert.equal(userRepository.createdTransaction.balanceAfterCents, SIGNUP_CREDIT_CENTS);
  assert.equal(userRepository.createdTransaction.memo, "注册赠送 30 积分");
});

test("AuthService maps duplicate register IP database errors to friendly message", async () => {
  const userRepository = new MemoryUserRepository(null);
  userRepository.createUserError = new Error("Duplicate entry '203.0.113.8' for key 'idx_users_register_ip'");
  const service = createRegisterAuthService({ userRepository });

  await assert.rejects(
    () => service.register(new Credentials({
      email: "user@qq.com",
      password: "secret123",
      verificationCode: "123456",
      registerIp: "203.0.113.8"
    })),
    /当前网络环境已注册过账号，请勿重复注册/
  );
});

test("AuthService maps duplicate username database errors to friendly message", async () => {
  const userRepository = new MemoryUserRepository(null);
  userRepository.createUserError = new Error("Duplicate entry 'user@qq.com' for key 'users.username'");
  const service = createRegisterAuthService({ userRepository });

  await assert.rejects(
    () => service.register(new Credentials({
      email: "user@qq.com",
      password: "secret123",
      verificationCode: "123456",
      registerIp: "203.0.113.8"
    })),
    /该用户名已被占用，请换一个试试/
  );
});

// 创建注册测试服务，隐藏测试依赖装配细节
function createRegisterAuthService(options = {}) {
  const userRepository = options.userRepository ?? new MemoryUserRepository(null);
  userRepository.registeredIpUser = options.registeredIpUser ?? null;

  return new AuthService({
    pool: new MemoryPool(),
    userRepository,
    sessionStore: new MemorySessionStore(),
    verificationService: new MemoryVerificationService(),
    signupCreditCents: SIGNUP_CREDIT_CENTS
  });
}

class MemoryUserRepository {
  constructor(user) {
    this.user = user;
    this.lastUsername = "";
    this.createdAccount = null;
    this.registeredIpUser = null;
    this.createUserError = null;
  }

  // 根据登录标识返回用户记录
  async findByUsername(username) {
    this.lastUsername = username;
    return username === this.user.username ? this.user : null;
  }

  // 根据注册 IP 返回测试账号记录
  async findByRegisterIp(registerIp) {
    this.lastRegisterIp = registerIp;
    return this.registeredIpUser;
  }

  // 记录事务内创建的测试账号
  async createUser(connection, account) {
    if (this.createUserError) throw this.createUserError;

    this.createdAccount = account;
    return 19;
  }

  // 记录测试钱包流水
  async createTransaction(connection, transaction) {
    this.createdTransaction = transaction;
  }
}

class MemorySessionStore {
  // 签发测试会话令牌
  async issue(user) {
    return `token-${user.id}`;
  }
}

class MemoryVerificationService {
  // 记录验证码校验调用
  async verifyCode(email, code) {
    this.lastVerification = { email, code };
    return true;
  }
}

class MemoryPool {
  // 创建测试事务连接
  async getConnection() {
    return new MemoryConnection();
  }
}

class MemoryConnection {
  // 开启测试事务
  async beginTransaction() {}

  // 提交测试事务
  async commit() {}

  // 回滚测试事务
  async rollback() {}

  // 释放测试连接
  release() {}
}
