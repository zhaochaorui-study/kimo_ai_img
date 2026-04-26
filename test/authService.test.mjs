import test from "node:test";
import assert from "node:assert/strict";

import { AuthService, Credentials } from "../src/services/authService.mjs";
import { hashPassword } from "../src/security/passwords.mjs";

test("AuthService logs in with email payload from the auth form", async () => {
  const passwordHash = hashPassword("secret123");
  const userRepository = new MemoryUserRepository({
    id: 9,
    username: "user@example.com",
    email: "user@example.com",
    password_hash: passwordHash.hash,
    password_salt: passwordHash.salt,
    balance_cents: 50
  });
  const sessionStore = new MemorySessionStore();
  const service = new AuthService({
    pool: {},
    userRepository,
    sessionStore,
    verificationService: {},
    signupCreditCents: 50
  });

  const result = await service.login(new Credentials({
    email: "USER@example.com",
    password: "secret123"
  }));

  assert.equal(userRepository.lastUsername, "user@example.com");
  assert.equal(result.token, "token-9");
  assert.equal(result.user.email, "user@example.com");
});

class MemoryUserRepository {
  constructor(user) {
    this.user = user;
    this.lastUsername = "";
  }

  // 根据登录标识返回用户记录
  async findByUsername(username) {
    this.lastUsername = username;
    return username === this.user.username ? this.user : null;
  }
}

class MemorySessionStore {
  // 签发测试会话令牌
  async issue(user) {
    return `token-${user.id}`;
  }
}
