// 图片生成仓储，封装生成记录的创建、更新和查询
export class GenerationRepository {
  constructor(pool) {
    this.pool = pool;
  }

  // 在事务中创建待处理生成记录
  async createPending(connection, generation) {
    const [result] = await connection.execute(
      `INSERT INTO generations
       (user_id, mode, prompt, negative_prompt, model_name, style_name, ratio,
        quantity, cost_cents, status, is_public, reference_image_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      this.#createGenerationParams(generation)
    );

    return Number(result.insertId);
  }

  // 标记生成记录为处理中，仅允许 pending 任务进入处理
  async markProcessing(generationId) {
    const [result] = await this.pool.execute(
      "UPDATE generations SET status = 'processing' WHERE id = ? AND status = 'pending'",
      [generationId]
    );

    return result.affectedRows > 0;
  }

  // 统计全局正在处理的生成任务数量
  async countProcessing() {
    const [rows] = await this.pool.execute(
      "SELECT COUNT(*) AS total FROM generations WHERE status = 'processing'"
    );

    return Number(rows[0]?.total ?? 0);
  }

  // 统计指定 pending 任务当前排队位次，包含自身
  async countPendingBefore(generationId) {
    const [rows] = await this.pool.execute(
      "SELECT COUNT(*) AS total FROM generations WHERE status = 'pending' AND id <= ?",
      [generationId]
    );

    return Number(rows[0]?.total ?? 0);
  }

  // 标记生成记录成功，并保存服务器相对图片路径
  async markSucceeded(generationId, imagePaths) {
    await this.pool.execute(
      "UPDATE generations SET status = 'succeeded', result_images = ?, error_message = NULL WHERE id = ?",
      [JSON.stringify(imagePaths), generationId]
    );
  }

  // 标记生成记录失败，并保存失败原因
  async markFailed(connection, generationId, message) {
    await connection.execute(
      "UPDATE generations SET status = 'failed', error_message = ? WHERE id = ?",
      [message, generationId]
    );
  }

  // 查询用户是否有正在进行的生成任务（pending 或 processing）
  async hasPendingOrProcessing(userId) {
    const [rows] = await this.pool.execute(
      "SELECT 1 FROM generations WHERE user_id = ? AND status IN ('pending', 'processing') LIMIT 1",
      [userId]
    );
    return rows.length > 0;
  }

  // 查询用户最近的生成历史
  async listByUser(userId, limit = 60) {
    const safeLimit = normalizeLimit(limit);
    const [rows] = await this.pool.execute(
      `SELECT g.*,
       CASE
         WHEN g.status = 'pending' THEN (
           SELECT COUNT(*) FROM generations q WHERE q.status = 'pending' AND q.id <= g.id
         )
         ELSE NULL
       END AS queue_position
       FROM generations g
       WHERE g.user_id = ?
       ORDER BY g.created_at DESC
       LIMIT ${safeLimit}`,
      [userId]
    );

    return rows.map((row) => this.#mapGenerationRow(row));
  }

  // 查询公开的生成记录（公共画廊）
  async listPublic(limit = 60) {
    const safeLimit = normalizeLimit(limit);
    const [rows] = await this.pool.execute(
      `SELECT * FROM generations WHERE is_public = 1 AND status = 'succeeded' ORDER BY created_at DESC LIMIT ${safeLimit}`
    );

    return rows.map((row) => this.#mapGenerationRow(row));
  }

  // 查询当前用户已加入公共画廊的生成记录
  async listPublicByUser(userId, limit = 60) {
    const safeLimit = normalizeLimit(limit);
    const [rows] = await this.pool.execute(
      `SELECT * FROM generations WHERE user_id = ? AND is_public = 1 AND status = 'succeeded' ORDER BY created_at DESC LIMIT ${safeLimit}`,
      [userId]
    );

    return rows.map((row) => this.#mapGenerationRow(row));
  }

  // 将当前用户的生成记录移出公共画廊，不删除历史记录
  async removeFromPublicByUser(userId, generationId) {
    const [result] = await this.pool.execute(
      "UPDATE generations SET is_public = 0 WHERE user_id = ? AND id = ? AND is_public = 1",
      [userId, generationId]
    );

    return result.affectedRows > 0;
  }

  // 切换当前用户生成记录的公开状态
  async togglePublicByUser(userId, generationId) {
    const [result] = await this.pool.execute(
      "UPDATE generations SET is_public = IF(is_public = 1, 0, 1) WHERE user_id = ? AND id = ?",
      [userId, generationId]
    );

    return result.affectedRows > 0;
  }

  // 删除当前用户自己的生成记录
  async deleteByUser(userId, generationId) {
    const [result] = await this.pool.execute(
      "DELETE FROM generations WHERE user_id = ? AND id = ?",
      [userId, generationId]
    );

    return result.affectedRows > 0;
  }

  // 将旧版 base64 图片记录迁移为服务器相对路径
  async migrateInlineImagesToPaths(imageStorageService) {
    const [rows] = await this.pool.execute(
      "SELECT id, user_id, result_images FROM generations WHERE status = 'succeeded' AND result_images IS NOT NULL"
    );

    for (const row of rows) {
      await this.#migrateInlineImageRow(row, imageStorageService);
    }
  }

  // 组装创建生成记录的 SQL 参数
  #createGenerationParams(generation) {
    return [
      generation.userId,
      generation.mode,
      generation.prompt,
      generation.negativePrompt,
      generation.modelName,
      generation.styleName,
      generation.ratio,
      generation.quantity,
      generation.costCents,
      generation.isPublic ? 1 : 0,
      generation.referenceImageName
    ];
  }

  // 将数据库行转换为前端需要的生成记录对象
  #mapGenerationRow(row) {
    return {
      id: row.id,
      mode: row.mode,
      prompt: row.prompt,
      negativePrompt: row.negative_prompt,
      modelName: row.model_name,
      styleName: row.style_name,
      ratio: row.ratio,
      quantity: row.quantity,
      costCents: row.cost_cents,
      status: row.status,
      queuePosition: row.queue_position === null || row.queue_position === undefined ? null : Number(row.queue_position),
      isPublic: Boolean(row.is_public),
      referenceImageName: row.reference_image_name,
      images: parseImages(row.result_images),
      errorMessage: row.error_message,
      createdAt: row.created_at
    };
  }

  // 迁移单条历史记录，已是路径的记录直接跳过
  async #migrateInlineImageRow(row, imageStorageService) {
    const images = parseImages(row.result_images);

    if (!hasInlineImages(images)) {
      return;
    }

    const imagePaths = await imageStorageService.saveGenerationImages({
      userId: row.user_id,
      generationId: row.id,
      images
    });

    await this.markSucceeded(row.id, imagePaths);
  }
}

// 标准化 LIMIT 参数，只允许安全整数进入 SQL
function normalizeLimit(limit) {
  const value = Number(limit);

  if (!Number.isInteger(value) || value < 1 || value > 100) {
    return 60;
  }

  return value;
}

// 解析数据库中的结果图 JSON，异常数据降级为空数组
function parseImages(value) {
  if (!value) {
    return [];
  }

  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

// 判断结果数组中是否仍包含 base64 内联图片
function hasInlineImages(images) {
  return images.some((image) => {
    const value = String(image ?? "");

    return value.startsWith("data:image/") || /^[A-Za-z0-9+/]+=*$/.test(value);
  });
}
