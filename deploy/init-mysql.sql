-- Kimo AI Image MySQL initialization script.
-- Replace REPLACE_WITH_STRONG_PASSWORD with the same DB_PASSWORD used in .env.

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS `create_img_web`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'kimo_app'@'localhost'
  IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';

CREATE USER IF NOT EXISTS 'kimo_app'@'127.0.0.1'
  IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';

GRANT ALL PRIVILEGES ON `create_img_web`.* TO 'kimo_app'@'localhost';
GRANT ALL PRIVILEGES ON `create_img_web`.* TO 'kimo_app'@'127.0.0.1';

FLUSH PRIVILEGES;

USE `create_img_web`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(64) NOT NULL UNIQUE,
  `email` VARCHAR(128) NULL UNIQUE,
  `register_ip` VARCHAR(64) NULL UNIQUE,
  `password_hash` VARCHAR(128) NOT NULL,
  `password_salt` VARCHAR(64) NOT NULL,
  `balance_cents` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wallet_transactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `amount_cents` INT NOT NULL,
  `balance_after_cents` INT NOT NULL,
  `memo` VARCHAR(255) NOT NULL DEFAULT '',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_wallet_user_created` (`user_id`, `created_at`),
  CONSTRAINT `fk_wallet_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `generations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `mode` VARCHAR(32) NOT NULL,
  `prompt` TEXT NOT NULL,
  `negative_prompt` TEXT NOT NULL,
  `model_name` VARCHAR(128) NOT NULL,
  `style_name` VARCHAR(64) NOT NULL,
  `ratio` VARCHAR(16) NOT NULL,
  `quantity` INT NOT NULL,
  `cost_cents` INT NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `is_public` TINYINT NOT NULL DEFAULT 0,
  `reference_image_name` VARCHAR(255) NOT NULL DEFAULT '',
  `result_images` LONGTEXT NULL,
  `error_message` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_generations_user_created` (`user_id`, `created_at`),
  INDEX `idx_generations_user_status` (`user_id`, `status`),
  INDEX `idx_generations_public` (`is_public`, `status`, `created_at`),
  CONSTRAINT `fk_generations_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
