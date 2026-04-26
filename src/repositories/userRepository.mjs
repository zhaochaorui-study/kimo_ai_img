// 用户仓储，封装所有用户和钱包相关 SQL
export class UserRepository {
  constructor(pool) {
    this.pool = pool;
  }

  // 根据用户名查询用户账号
  async findByUsername(username) {
    const [rows] = await this.pool.execute(
      "SELECT * FROM users WHERE username = ? LIMIT 1",
      [username]
    );

    return rows[0] ?? null;
  }

  // 根据用户 ID 查询用户账号
  async findById(userId) {
    const [rows] = await this.pool.execute(
      "SELECT * FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    return rows[0] ?? null;
  }

  // 根据注册 IP 查询用户账号
  async findByRegisterIp(registerIp) {
    const [rows] = await this.pool.execute(
      "SELECT id, username, email FROM users WHERE register_ip = ? LIMIT 1",
      [registerIp]
    );

    return rows[0] ?? null;
  }

  // 在事务中创建用户账号
  async createUser(connection, account) {
    const [result] = await connection.execute(
      "INSERT INTO users (username, email, register_ip, password_hash, password_salt, balance_cents) VALUES (?, ?, ?, ?, ?, ?)",
      [
        account.username,
        account.email,
        account.registerIp,
        account.passwordHash,
        account.passwordSalt,
        account.balanceCents
      ]
    );

    return Number(result.insertId);
  }

  // 在事务中查询并锁定用户钱包
  async lockWallet(connection, userId) {
    const [rows] = await connection.execute(
      "SELECT id, username, balance_cents FROM users WHERE id = ? FOR UPDATE",
      [userId]
    );

    return rows[0] ?? null;
  }

  // 在事务中更新钱包余额
  async updateBalance(connection, userId, balanceCents) {
    await connection.execute(
      "UPDATE users SET balance_cents = ? WHERE id = ?",
      [balanceCents, userId]
    );
  }

  // 在事务中插入钱包流水
  async createTransaction(connection, transaction) {
    await connection.execute(
      `INSERT INTO wallet_transactions
       (user_id, type, amount_cents, balance_after_cents, memo)
       VALUES (?, ?, ?, ?, ?)`,
      [
        transaction.userId,
        transaction.type,
        transaction.amountCents,
        transaction.balanceAfterCents,
        transaction.memo
      ]
    );
  }

  // 查询用户最近的钱包流水
  async listTransactions(userId, limit = 20) {
    const safeLimit = normalizeLimit(limit);
    const [rows] = await this.pool.execute(
      `SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
      [userId]
    );

    return rows;
  }
}

// 标准化 LIMIT 参数，只允许安全整数进入 SQL
function normalizeLimit(limit) {
  const value = Number(limit);

  if (!Number.isInteger(value) || value < 1 || value > 100) {
    return 20;
  }

  return value;
}
