const createCategoryQueries = (deps = {}) => {
  const {
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    normalizeCategoryName,
    toNullablePositiveInt,
    normalizeCategoryRow,
  } = deps;

  const findCategoryByNameAndParentAsync = async ({ name, parentId = null, excludeId = null }) => {
    const trimmedName = normalizeCategoryName(name);
    if (!trimmedName) return null;
    const normalizedParentId = toNullablePositiveInt(parentId);
    const normalizedExcludeId = toNullablePositiveInt(excludeId);
    const parentFilter = normalizedParentId == null
      ? 'parent_id IS NULL'
      : 'parent_id = ?';
    const parentParams = normalizedParentId == null ? [] : [normalizedParentId];
    const row = await dbGetAsync(
      `SELECT id, name, description, icon, image, image_width, image_height, parent_id, created_at
       FROM categories
       WHERE lower(name) = lower(?)
         AND ${parentFilter}
         ${normalizedExcludeId ? 'AND id <> ?' : ''}
       LIMIT 1`,
      normalizedExcludeId
        ? [trimmedName, ...parentParams, normalizedExcludeId]
        : [trimmedName, ...parentParams]
    );
    return row ? normalizeCategoryRow(row) : null;
  };

  const getCategoryByIdAsync = async (id) => {
    if (!Number.isInteger(Number(id)) || Number(id) <= 0) return null;
    const row = await dbGetAsync(
      `SELECT id, name, description, icon, image, image_width, image_height, parent_id, created_at
       FROM categories
       WHERE id = ?`,
      [Number(id)]
    );
    return row ? normalizeCategoryRow(row) : null;
  };

  const ensureCategoryNodeAsync = async ({ name, parentId = null, description = null }) => {
    const trimmedName = normalizeCategoryName(name);
    if (!trimmedName) return null;
    const normalizedParentId = toNullablePositiveInt(parentId);
    const existing = await findCategoryByNameAndParentAsync({
      name: trimmedName,
      parentId: normalizedParentId,
    });
    if (existing) return existing;
    const inserted = await dbRunAsync(
      `INSERT INTO categories (name, description, parent_id)
       VALUES (?, ?, ?)`,
      [trimmedName, description || null, normalizedParentId]
    );
    const created = await dbGetAsync(
      `SELECT id, name, description, icon, image, image_width, image_height, parent_id, created_at
       FROM categories
       WHERE id = ?`,
      [inserted.lastInsertRowid]
    );
    return created ? normalizeCategoryRow(created) : null;
  };

  const listCategoryRowsWithCountsAsync = async () => (
    await dbAllAsync(
      `SELECT
         c.id,
         c.name,
         c.description,
         c.icon,
         c.image,
         c.image_width,
         c.image_height,
         c.parent_id,
         c.created_at,
         p.name AS parent_name,
         COALESCE(pc.direct_count, 0) AS product_count
       FROM categories c
       LEFT JOIN categories p ON p.id = c.parent_id
       LEFT JOIN (
         SELECT category_id, COUNT(*) AS direct_count
         FROM products
         WHERE category_id IS NOT NULL
         GROUP BY category_id
       ) pc ON pc.category_id = c.id
       ORDER BY LOWER(c.name) ASC`
    )
  ).map(normalizeCategoryRow);

  return {
    findCategoryByNameAndParentAsync,
    getCategoryByIdAsync,
    ensureCategoryNodeAsync,
    listCategoryRowsWithCountsAsync,
  };
};

module.exports = { createCategoryQueries };
