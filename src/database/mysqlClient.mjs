import mysql from "mysql2/promise";

// 初始化数据库连接池，并在启动时自动建库建表
export async function createDatabasePool(config) {
  await ensureDatabaseExists(config);
  const pool = mysql.createPool(createPoolOptions(config));
  await ensureTablesExist(pool);

  return pool;
}

// 创建数据库，不存在时自动补齐本地库
async function ensureDatabaseExists(config) {
  const connection = await mysql.createConnection(createServerOptions(config));

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${config.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await connection.end();
  }
}

// 创建业务表结构，保证新机器启动即可运行
async function ensureTablesExist(pool) {
  await pool.query(createUsersTableSql());
  await pool.query(createTransactionsTableSql());
  await pool.query(createGenerationsTableSql());
}

// 创建 MySQL 服务级连接配置
function createServerOptions(config) {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: false
  };
}

// 创建连接池配置
function createPoolOptions(config) {
  return {
    ...createServerOptions(config),
    database: config.name,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true
  };
}

// 用户表结构，保存账号、密码哈希和可用余额
function createUsersTableSql() {
  return `
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      password_hash VARCHAR(128) NOT NULL,
      password_salt VARCHAR(64) NOT NULL,
      balance_cents INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;
}

// 额度流水表结构，所有赠送、扣费、退款和充值意向都可追溯
function createTransactionsTableSql() {
  return `
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      type VARCHAR(32) NOT NULL,
      amount_cents INT NOT NULL,
      balance_after_cents INT NOT NULL,
      memo VARCHAR(255) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_wallet_user_created (user_id, created_at),
      CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;
}

// 图片生成记录表结构，保存请求参数、结果图和错误信息
function createGenerationsTableSql() {
  return `
    CREATE TABLE IF NOT EXISTS generations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      mode VARCHAR(32) NOT NULL,
      prompt TEXT NOT NULL,
      negative_prompt TEXT NOT NULL,
      model_name VARCHAR(128) NOT NULL,
      style_name VARCHAR(64) NOT NULL,
      ratio VARCHAR(16) NOT NULL,
      quantity INT NOT NULL,
      cost_cents INT NOT NULL,
      status VARCHAR(32) NOT NULL,
      is_public TINYINT NOT NULL DEFAULT 0,
      reference_image_name VARCHAR(255) NOT NULL DEFAULT '',
      result_images LONGTEXT NULL,
      error_message TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_generations_user_created (user_id, created_at),
      INDEX idx_generations_public (is_public, status, created_at),
      CONSTRAINT fk_generations_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;
}

// 在事务中执行数据库工作，失败时自动回滚
export async function runInTransaction(pool, work) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();

    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
