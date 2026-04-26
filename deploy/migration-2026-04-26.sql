-- ============================================
-- 增量迁移：2026-04-26
-- 变更内容：
--   1. 增加复合索引 idx_generations_user_status
--      用于快速判断用户是否有 pending/processing 任务
--   2. 清理系统升级前残留的 pending/processing 记录
-- ============================================

USE `create_img_web`;

-- --------------------------------------------------------
-- 1. 结构变更：增加索引
-- --------------------------------------------------------
-- MySQL 8.0+ 支持 CREATE INDEX IF NOT EXISTS
-- 如果版本较低，可改用：
--   ALTER TABLE `generations` ADD INDEX `idx_generations_user_status` (`user_id`, `status`);
CREATE INDEX IF NOT EXISTS `idx_generations_user_status`
  ON `generations` (`user_id`, `status`);

-- --------------------------------------------------------
-- 2. 数据修复：将旧版本中残留的 pending/processing 标记为失败
--    （因为旧版本没有 processing 状态，也不存在单任务限制，
--     系统重启后这些记录实际上已经中断，需要清理）
-- --------------------------------------------------------
UPDATE `generations`
SET `status` = 'failed',
    `error_message` = '系统升级：历史遗留任务已自动标记为失败'
WHERE `status` IN ('pending', 'processing');

-- --------------------------------------------------------
-- 回滚语句（如需要撤销本次迁移）
-- --------------------------------------------------------
-- DROP INDEX `idx_generations_user_status` ON `generations`;
