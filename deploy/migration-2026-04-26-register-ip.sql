-- Register IP security migration.
-- Purpose:
--   1. Add users.register_ip to remember the source IP used at signup.
--   2. Add a unique index so one IP can create at most one account.
--   3. Keep existing users nullable to avoid breaking historical accounts.

SET NAMES utf8mb4;

USE `create_img_web`;

SET @register_ip_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'register_ip'
);

SET @add_register_ip_column_sql := IF(
  @register_ip_column_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `register_ip` VARCHAR(64) NULL AFTER `email`',
  'SELECT ''users.register_ip already exists'' AS message'
);

PREPARE add_register_ip_column_stmt FROM @add_register_ip_column_sql;
EXECUTE add_register_ip_column_stmt;
DEALLOCATE PREPARE add_register_ip_column_stmt;

SET @register_ip_unique_index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'register_ip'
    AND NON_UNIQUE = 0
);

SET @add_register_ip_index_sql := IF(
  @register_ip_unique_index_exists = 0,
  'ALTER TABLE `users` ADD UNIQUE INDEX `idx_users_register_ip` (`register_ip`)',
  'SELECT ''users.register_ip unique index already exists'' AS message'
);

PREPARE add_register_ip_index_stmt FROM @add_register_ip_index_sql;
EXECUTE add_register_ip_index_stmt;
DEALLOCATE PREPARE add_register_ip_index_stmt;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'register_ip';

SELECT
  INDEX_NAME,
  COLUMN_NAME,
  NON_UNIQUE
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'register_ip';

-- Rollback, only after confirming no signup enforcement depends on this column:
-- ALTER TABLE `users` DROP INDEX `idx_users_register_ip`;
-- ALTER TABLE `users` DROP COLUMN `register_ip`;
