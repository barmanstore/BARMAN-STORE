const registerCategoryUpdateRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    dbRunAsync,
    normalizeCategoryName,
    normalizeCategoryIcon,
    normalizeCategoryImage,
    toNullableImageDimension,
    toNullablePositiveInt,
    hasOwn,
    findCategoryByNameAndParentAsync,
    getCategoryByIdAsync,
    detectParentCycle,
  } = deps;

  app.put('/api/categories/:id(\\d+)', requireAdmin, async (req, res) => {
    try {
      const categoryId = toNullablePositiveInt(req.params.id);
      if (!categoryId) return res.status(400).json({ error: 'Invalid category id' });
      const current = await getCategoryByIdAsync(categoryId);
      if (!current) return res.status(404).json({ error: 'Category not found' });

      const nextName = hasOwn(req.body, 'name')
        ? normalizeCategoryName(req.body?.name)
        : normalizeCategoryName(current.name);
      if (!nextName) return res.status(400).json({ error: 'Category name is required' });

      let nextParentId = current.parent_id == null ? null : Number(current.parent_id);
      if (hasOwn(req.body, 'parent_id')) {
        const rawParent = req.body?.parent_id;
        if (rawParent === null || rawParent === '') {
          nextParentId = null;
        } else {
          nextParentId = toNullablePositiveInt(rawParent);
          if (!nextParentId)
            return res.status(400).json({ error: 'parent_id must be a positive integer or null' });
        }
      }
      if (nextParentId === categoryId) {
        return res.status(400).json({ error: 'A category cannot be its own parent' });
      }

      if (nextParentId) {
        const parent = await getCategoryByIdAsync(nextParentId);
        if (!parent) return res.status(404).json({ error: 'Parent category not found' });
        const allRows = await dbAllAsync('SELECT id, parent_id FROM categories');
        if (detectParentCycle(allRows, categoryId, nextParentId)) {
          return res.status(400).json({ error: 'Cannot move category inside its own subtree' });
        }
      }

      const duplicate = await findCategoryByNameAndParentAsync({
        name: nextName,
        parentId: nextParentId,
        excludeId: categoryId,
      });
      if (duplicate) return res.status(409).json({ error: 'Category name already exists' });

      const nextDescription = hasOwn(req.body, 'description')
        ? req.body?.description == null
          ? null
          : String(req.body.description).trim() || null
        : current.description;
      const nextIcon = hasOwn(req.body, 'icon')
        ? normalizeCategoryIcon(req.body?.icon)
        : normalizeCategoryIcon(current.icon);
      const nextImage = hasOwn(req.body, 'image')
        ? normalizeCategoryImage(req.body?.image)
        : normalizeCategoryImage(current.image);
      const nextImageWidthInput =
        hasOwn(req.body, 'image_width') || hasOwn(req.body, 'imageWidth')
          ? (req.body?.image_width ?? req.body?.imageWidth)
          : current.image_width;
      const nextImageHeightInput =
        hasOwn(req.body, 'image_height') || hasOwn(req.body, 'imageHeight')
          ? (req.body?.image_height ?? req.body?.imageHeight)
          : current.image_height;
      const nextImageWidth = nextImage ? toNullableImageDimension(nextImageWidthInput) : null;
      const nextImageHeight = nextImage ? toNullableImageDimension(nextImageHeightInput) : null;

      await dbRunAsync(
        `UPDATE categories
         SET name = ?, description = ?, icon = ?, image = ?, image_width = ?, image_height = ?, parent_id = ?
         WHERE id = ?`,
        [
          nextName,
          nextDescription,
          nextIcon,
          nextImage,
          nextImageWidth,
          nextImageHeight,
          nextParentId,
          categoryId,
        ]
      );
      return res.json(await getCategoryByIdAsync(categoryId));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCategoryUpdateRoutes };
