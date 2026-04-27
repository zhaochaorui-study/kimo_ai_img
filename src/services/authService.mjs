import { runInTransaction } from "../database/mysqlClient.mjs";
import { CreditAmount } from "../domain/billing.mjs";
import { hashPassword, verifyPassword } from "../security/passwords.mjs";
import { WalletTransactionType } from "../domain/billing.mjs";
import { assertAllowedRegisterEmailDomain } from "../security/emailPolicy.mjs";

const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const DUPLICATE_REGISTER_IP_MESSAGE = "当前网络环境已注册过账号，请勿重复注册";

// 认证服务，负责注册、登录和当前用户查询
export class AuthService {
  constructor(input) {
    this.pool = input.pool;
    this.userRepository = input.userRepository;
    this.sessionStore = input.sessionStore;
    this.verificationService = input.verificationService;
    this.signupCreditCents = input.signupCreditCents;
  }

  // 注册账号，校验验证码后事务内创建用户并写入注册送额度流水
  async register(credentials) {
    this.#validateCredentials(credentials);

    // 调用邮箱白名单校验，避免验证码通过后仍允许非目标邮箱注册
    assertAllowedRegisterEmailDomain(credentials.email);

    // 调用注册来源校验，阻止同一 IP 重复创建账号
    await this.#assertRegisterIpAvailable(credentials.registerIp);

    // 校验邮箱验证码
    await this.verificationService.verifyCode(credentials.email, credentials.verificationCode);

    const passwordHash = hashPassword(credentials.password);

    // 调用事务创建用户，保证账号和赠送额度流水一致
    const user = await this.#createUserTransaction(credentials, passwordHash);

    return this.#createSessionPayload(user);
  }

  // 登录账号，验证密码后签发本地会话令牌
  async login(credentials) {
    const user = await this.userRepository.findByUsername(credentials.loginIdentifier);

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
    if (!EMAIL_PATTERN.test(credentials.email)) {
      throw new Error("请输入有效的邮箱地址");
    }

    if (String(credentials.password ?? "").length < MIN_PASSWORD_LENGTH) {
      throw new Error("密码至少 6 位");
    }
  }

  // 校验注册 IP 是否可用，确保每个来源地址只能注册一次
  async #assertRegisterIpAvailable(registerIp) {
    if (!registerIp) {
      throw new Error("无法识别注册来源，请稍后重试");
    }

    const existingUser = await this.userRepository.findByRegisterIp(registerIp);

    if (existingUser) {
      throw new Error(DUPLICATE_REGISTER_IP_MESSAGE);
    }
  }

  // 执行注册事务，并把数据库唯一索引错误转换成业务提示
  async #createUserTransaction(credentials, passwordHash) {
    try {
      return await runInTransaction(this.pool, async (connection) => {
        return this.#createUserWithSignupGift(connection, credentials, passwordHash);
      });
    } catch (error) {
      this.#throwFriendlyDuplicateError(error);
      throw error;
    }
  }

  // 将注册唯一索引冲突转换成用户可理解的错误
  #throwFriendlyDuplicateError(error) {
    const message = String(error.message ?? "");

    if (message.includes("idx_users_register_ip")) {
      throw new Error(DUPLICATE_REGISTER_IP_MESSAGE);
    }

    if (message.includes("idx_users_email") || message.includes("users.email")) {
      throw new Error("该邮箱已注册，请直接登录");
    }

    if (message.includes("users.username")) {
      throw new Error("该用户名已被占用，请换一个试试");
    }
  }

  // 创建用户并插入注册送额度流水
  async #createUserWithSignupGift(connection, credentials, passwordHash) {
    const userId = await this.userRepository.createUser(connection, {
      username: credentials.email,
      email: credentials.email,
      registerIp: credentials.registerIp,
      passwordHash: passwordHash.hash,
      passwordSalt: passwordHash.salt,
      balanceCents: this.signupCreditCents
    });

    await this.#recordSignupGift(connection, userId);

    return { id: userId, username: credentials.email, email: credentials.email, balance_cents: this.signupCreditCents };
  }

  // 记录注册送额度流水
  async #recordSignupGift(connection, userId) {
    await this.userRepository.createTransaction(connection, {
      userId,
      type: WalletTransactionType.SignupGift,
      amountCents: this.signupCreditCents,
      balanceAfterCents: this.signupCreditCents,
      memo: this.#createSignupGiftMemo()
    });
  }

  // 创建注册送积分流水文案，确保文案与配置额度一致
  #createSignupGiftMemo() {
    return `注册赠送 ${this.signupCreditCents} 积分`;
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
      email: user.email,
      balanceCents: Number(user.balance_cents)
    };
  }
}

// 登录注册凭据传输对象
export class Credentials {
  constructor(input) {
    this.username = String(input.username ?? "").trim();
    this.email = String(input.email ?? "").trim().toLowerCase();
    this.loginIdentifier = this.email || this.username;
    this.password = String(input.password ?? "");
    this.verificationCode = String(input.verificationCode ?? "");
    this.registerIp = String(input.registerIp ?? "").trim();
  }
}
