const createCategoryErrors = () => {
  const isCategoryNameUniqueViolation = (error) => {
    const message = String(error?.message || '').toLowerCase();
    if (!message) return false;
    return (
      message.includes('uq_categories_parent_name_ci') ||
      (message.includes('duplicate key') && message.includes('categories'))
    );
  };

  return { isCategoryNameUniqueViolation };
};

module.exports = { createCategoryErrors };
