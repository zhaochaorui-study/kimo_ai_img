import { runInTransaction } from "../database/mysqlClient.mjs";
import { CreditAmount, UserWallet, WalletTransactionType } from "../domain/billing.mjs";

// 钱包服务，负责余额查询、扣费、退款和充值意向
export class WalletService {
  constructor(input) {
    this.pool = input.pool;
    this.userRepository = input.userRepository;
    this.rechargeContact = input.rechargeContact;
  }

  // 查询用户钱包余额和近期流水
  async loadWallet(userId) {
    const user = await this.userRepository.findById(userId);
    const transactions = await this.userRepository.listTransactions(userId);

    return {
      balanceCents: Number(user.balance_cents),
      transactions
    };
  }

  // 创建充值意向，提示用户联系人工 QQ
  async createRechargeRequest(userId, amountCents) {
    const amount = this.#normalizeRechargeAmount(amountCents);

    // 调用事务记录充值意向，保证客服可追溯
    await runInTransaction(this.pool, async (connection) => {
      await this.#recordRechargeRequest(connection, userId, amount);
    });

    return { contact: this.rechargeContact, amountCents: amount };
  }

  // 为生成请求扣减额度，并返回扣费后的余额
  async spendForGeneration(userId, costCents) {
    return runInTransaction(this.pool, async (connection) => {
      const walletRow = await this.#lockExistingWallet(connection, userId);
      const wallet = new UserWallet(CreditAmount.fromCents(walletRow.balance_cents));
      const balance = wallet.spend(CreditAmount.fromCents(costCents));

      await this.#persistSpend(connection, userId, costCents, balance.toCents());

      return { balanceCents: balance.toCents() };
    });
  }

  // 扣减额度并创建生成记录，保证扣费和任务记录在同一事务内
  async spendAndCreateGeneration(userId, generation) {
    return runInTransaction(this.pool, async (connection) => {
      const walletRow = await this.#lockExistingWallet(connection, userId);
      const wallet = new UserWallet(CreditAmount.fromCents(walletRow.balance_cents));
      const balance = wallet.spend(CreditAmount.fromCents(generation.costCents));

      await this.#persistSpend(connection, userId, generation.costCents, balance.toCents());
      const generationId = await this.generationRepository.createPending(connection, generation);

      return { generationId, balanceCents: balance.toCents() };
    });
  }

  // 生成失败时返还额度，并记录退款流水
  async refundGeneration(userId, generationId, costCents, errorMessage) {
    await runInTransaction(this.pool, async (connection) => {
      const walletRow = await this.#lockExistingWallet(connection, userId);
      const wallet = new UserWallet(CreditAmount.fromCents(walletRow.balance_cents));
      const balance = wallet.receive(CreditAmount.fromCents(costCents));

      await this.#persistRefund(connection, userId, generationId, costCents, balance.toCents());
      await this.generationRepository?.markFailed(connection, generationId, errorMessage);
    });
  }

  // 挂载生成仓储，避免钱包服务和图片服务循环构造
  attachGenerationRepository(generationRepository) {
    this.generationRepository = generationRepository;
  }

  // 锁定用户钱包，不存在则抛出业务异常
  async #lockExistingWallet(connection, userId) {
    const walletRow = await this.userRepository.lockWallet(connection, userId);

    if (!walletRow) {
      throw new Error("用户不存在");
    }

    return walletRow;
  }

  // 持久化扣费结果和扣费流水
  async #persistSpend(connection, userId, costCents, balanceAfterCents) {
    await this.userRepository.updateBalance(connection, userId, balanceAfterCents);
    await this.userRepository.createTransaction(connection, {
      userId,
      type: WalletTransactionType.GenerationCharge,
      amountCents: -costCents,
      balanceAfterCents,
      memo: "图片生成扣费"
    });
  }

  // 持久化退款结果和退款流水
  async #persistRefund(connection, userId, generationId, costCents, balanceAfterCents) {
    await this.userRepository.updateBalance(connection, userId, balanceAfterCents);
    await this.userRepository.createTransaction(connection, {
      userId,
      type: WalletTransactionType.Refund,
      amountCents: costCents,
      balanceAfterCents,
      memo: `生成失败退款 #${generationId}`
    });
  }

  // 记录充值意向流水
  async #recordRechargeRequest(connection, userId, amountCents) {
    const walletRow = await this.#lockExistingWallet(connection, userId);

    await this.userRepository.createTransaction(connection, {
      userId,
      type: WalletTransactionType.RechargeRequest,
      amountCents: 0,
      balanceAfterCents: Number(walletRow.balance_cents),
      memo: `申请充值 $${(amountCents / 100).toFixed(2)}，联系 ${this.rechargeContact}`
    });
  }

  // 校验充值意向金额
  #normalizeRechargeAmount(amountCents) {
    const amount = Number(amountCents);

    if (!Number.isInteger(amount) || amount < 10 || amount > 10000) {
      throw new Error("充值金额需在 10 到 10000 积分之间");
    }

    return amount;
  }
}
