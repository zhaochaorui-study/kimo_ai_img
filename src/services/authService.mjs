import { runInTransaction } from "../database/mysqlClient.mjs";
import { CreditAmount } from "../domain/billing.mjs";
import { hashPassword, verifyPassword } from "../security/passwords.mjs";
import { WalletTransactionType } from "../domain/billing.mjs";

const MIN_PASSWORD_LENGTH = 6;
const USERNAME_PATTERN = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,32}$/;

// 认证服务，负责注册、登录和当前用户查询
export class AuthService {
  constructor(input) {
    this.pool = input.pool;
    this.userRepository = input.userRepository;
    this.sessionStore = input.sessionStore;
    this.signupCreditCents = input.signupCreditCents;
  }

  // 注册账号，事务内创建用户并写入注册送额度流水
  async register(credentials) {
    this.#validateCredentials(credentials);
    const passwordHash = hashPassword(credentials.password);

    // 调用事务创建用户，保证账号和赠送额度流水一致
    const user = await runInTransaction(this.pool, async (connection) => {
      return this.#createUserWithSignupGift(connection, credentials, passwordHash);
    });

    return this.#createSessionPayload(user);
  }

  // 登录账号，验证密码后签发本地会话令牌
  async login(credentials) {
    const user = await this.userRepository.findByUsername(credentials.username);

    if (!user || !verifyPassword(credentials.password, user.password_hash, user.password_salt)) {
      throw new Error("用户名或密码错误");
    }

    return this.#createSessionPayload(user);
  }

  // 根据会话身份加载当前用户
  async loadSessionUser(session) {
    const user = await this.userRepository.findById(session.userId);

    if (!user) {
      throw new Error("用户不存在");
    }

    return this.#createUserPayload(user);
  }

  // 校验注册和登录凭据
  #validateCredentials(credentials) {
    if (!USERNAME_PATTERN.test(credentials.username)) {
      throw new Error("用户名需为 2-32 位中文、字母、数字或下划线");
    }

    if (String(credentials.password ?? "").length < MIN_PASSWORD_LENGTH) {
      throw new Error("密码至少 6 位");
    }
  }

  // 创建用户并插入注册送额度流水
  async #createUserWithSignupGift(connection, credentials, passwordHash) {
    const userId = await this.userRepository.createUser(connection, {
      username: credentials.username,
      passwordHash: passwordHash.hash,
      passwordSalt: passwordHash.salt,
      balanceCents: this.signupCreditCents
    });

    await this.#recordSignupGift(connection, userId);

    return { id: userId, username: credentials.username, balance_cents: this.signupCreditCents };
  }

  // 记录注册送额度流水
  async #recordSignupGift(connection, userId) {
    await this.userRepository.createTransaction(connection, {
      userId,
      type: WalletTransactionType.SignupGift,
      amountCents: this.signupCreditCents,
      balanceAfterCents: this.signupCreditCents,
      memo: "注册赠送 50 积分"
    });
  }

  // 创建登录成功返回体
  async #createSessionPayload(user) {
    const userPayload = this.#createUserPayload(user);

    return {
      token: await this.sessionStore.issue(userPayload),
      user: userPayload
    };
  }

  // 转换用户对象，隐藏密码字段
  #createUserPayload(user) {
    return {
      id: Number(user.id),
      username: user.username,
      balanceCents: Number(user.balance_cents)
    };
  }
}

// 登录注册凭据传输对象
export class Credentials {
  constructor(input) {
    this.username = String(input.username ?? "").trim();
    this.password = String(input.password ?? "");
  }
}
