import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const HASH_ITERATIONS = 120000;
const HASH_LENGTH = 32;
const HASH_DIGEST = "sha256";

// 生成密码哈希和盐，避免明文密码落库
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = createPasswordHash(password, salt);

  return new PasswordHash(hash, salt);
}

// 校验密码是否匹配数据库中保存的哈希
export function verifyPassword(password, storedHash, salt) {
  const candidate = Buffer.from(createPasswordHash(password, salt), "hex");
  const expected = Buffer.from(storedHash, "hex");

  if (candidate.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(candidate, expected);
}

// 使用 PBKDF2 生成稳定密码摘要
function createPasswordHash(password, salt) {
  return pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_LENGTH, HASH_DIGEST).toString("hex");
}

// 密码哈希传输对象，封装 hash 与 salt
export class PasswordHash {
  constructor(hash, salt) {
    this.hash = hash;
    this.salt = salt;
  }
}
