-- ============================================
-- 增量迁移：2026-04-26 邮箱注册支持
-- 变更内容：
--   1. users 表增加 email 字段
--   2. 将旧用户 username 回填到 email
--   3. 为 email 增加唯一索引
-- 说明：
--   使用 INFORMATION_SCHEMA + PREPARE，兼容不支持
--   ALTER TABLE ... IF NOT EXISTS 的 MySQL 版本。
-- ============================================

SET NAMES utf8mb4;

USE `create_img_web`;

SET @email_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'email'
);

SET @add_email_column_sql := IF(
  @email_column_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `email` VARCHAR(128) NULL AFTER `username`',
  'SELECT ''users.email already exists'' AS message'
);

PREPARE add_email_column_stmt FROM @add_email_column_sql;
EXECUTE add_email_column_stmt;
DEALLOCATE PREPARE add_email_column_stmt;

UPDATE `users`
SET `email` = `username`
WHERE `email` IS NULL;

SET @email_unique_index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'email'
    AND NON_UNIQUE = 0
);

SET @add_email_index_sql := IF(
  @email_unique_index_exists = 0,
  'ALTER TABLE `users` ADD UNIQUE INDEX `idx_users_email` (`email`)',
  'SELECT ''users.email unique index already exists'' AS message'
);

PREPARE add_email_index_stmt FROM @add_email_index_sql;
EXECUTE add_email_index_stmt;
DEALLOCATE PREPARE add_email_index_stmt;

-- --------------------------------------------------------
-- 验证语句
-- --------------------------------------------------------
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'email';

SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'email';

-- --------------------------------------------------------
-- 回滚语句（确认没有新用户依赖 email 后再执行）
-- --------------------------------------------------------
-- ALTER TABLE `users` DROP INDEX `idx_users_email`;
-- ALTER TABLE `users` DROP COLUMN `email`;
