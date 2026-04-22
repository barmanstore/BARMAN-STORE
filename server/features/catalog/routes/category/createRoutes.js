const registerCategoryCreateRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbRunAsync,
    normalizeCategoryName,
    normalizeCategoryIcon,
    normalizeCategoryImage,
    toNullableImageDimension,
    toNullablePositiveInt,
    hasOwn,
    findCategoryByNameAndParentAsync,
    getCategoryByIdAsync,
  } = deps;

  app.post('/api/categories', requireAdmin, async (req, res) => {
    try {
      const name = normalizeCategoryName(req.body?.name);
      if (!name) return res.status(400).json({ error: 'Category name is required' });
      const icon = normalizeCategoryIcon(req.body?.icon);
      const image = normalizeCategoryImage(req.body?.image);
      const imageWidth = toNullableImageDimension(req.body?.image_width ?? req.body?.imageWidth);
      const imageHeight = toNullableImageDimension(req.body?.image_height ?? req.body?.imageHeight);

      let parentId = null;
      if (hasOwn(req.body, 'parent_id')) {
        const rawParent = req.body?.parent_id;
        if (rawParent !== null && rawParent !== '') {
          parentId = toNullablePositiveInt(rawParent);
          if (!parentId)
            return res.status(400).json({ error: 'parent_id must be a positive integer or null' });
        }
      }

      if (parentId) {
        const parent = await getCategoryByIdAsync(parentId);
        if (!parent) return res.status(404).json({ error: 'Parent category not found' });
      }

      const duplicate = await findCategoryByNameAndParentAsync({ name, parentId });
      if (duplicate) return res.status(409).json({ error: 'Category name already exists' });

      const result = await dbRunAsync(
        `INSERT INTO categories (name, description, icon, image, image_width, image_height, parent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          req.body?.description == null ? null : String(req.body.description).trim() || null,
          icon,
          image,
          image ? imageWidth : null,
          image ? imageHeight : null,
          parentId,
        ]
      );
      return res.status(201).json(await getCategoryByIdAsync(result.lastInsertRowid));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCategoryCreateRoutes };
