import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Edit2, Trash2, X, FolderTree, GitBranch, RefreshCcw } from 'lucide-react';
import { categoriesApi } from '../../../services/api';
import useLockBodyScroll from '../../../hooks/useLockBodyScroll';
import './CategoryManagement.css';

const toNumericId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

function CategoryManagement({ onClose }) {
  useLockBodyScroll(true);
  const [categories, setCategories] = useState([]);
  const [categoryTree, setCategoryTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [activeView, setActiveView] = useState('tree');
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [expandedMap, setExpandedMap] = useState({});
  const [dragProductId, setDragProductId] = useState(null);
  const [categoryProducts, setCategoryProducts] = useState([]);
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingProductCategoryId, setEditingProductCategoryId] = useState('');
  const [editingProductCategoryQuery, setEditingProductCategoryQuery] = useState('');
  const [editingProductCategoryFocusIndex, setEditingProductCategoryFocusIndex] = useState(-1);
  const [savingProductEdit, setSavingProductEdit] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parent_id: '',
    icon: '',
    image: '',
    image_width: '',
    image_height: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const formSectionRef = useRef(null);
  const nameInputRef = useRef(null);
  const productCategoryInputRef = useRef(null);

  const categoryMap = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => map.set(Number(category.id), category));
    return map;
  }, [categories]);

  const flattenedTree = useMemo(() => {
    const out = [];
    const walk = (nodes, depth = 0) => {
      nodes.forEach((node) => {
        out.push({ ...node, depth });
        if (Array.isArray(node.children) && node.children.length > 0) {
          walk(node.children, depth + 1);
        }
      });
    };
    walk(categoryTree, 0);
    return out;
  }, [categoryTree]);

  const selectedCategory = useMemo(
    () => categories.find((category) => Number(category.id) === Number(selectedCategoryId)) || null,
    [categories, selectedCategoryId]
  );

  const isDescendantOf = (candidateId, ancestorId) => {
    let cursor = categoryMap.get(Number(candidateId));
    const visited = new Set();
    while (cursor && cursor.parent_id && !visited.has(Number(cursor.id))) {
      if (Number(cursor.parent_id) === Number(ancestorId)) return true;
      visited.add(Number(cursor.id));
      cursor = categoryMap.get(Number(cursor.parent_id));
    }
    return false;
  };

  const parentOptions = useMemo(() => (
    flattenedTree.filter((node) => {
      if (!editingId) return true;
      if (Number(node.id) === Number(editingId)) return false;
      if (isDescendantOf(node.id, editingId)) return false;
      return true;
    })
  ), [flattenedTree, editingId]);

  const productCategoryOptions = useMemo(
    () => flattenedTree.map((node) => ({
      id: Number(node.id),
      label: `${'  '.repeat(Math.max(0, Number(node.depth || 0)))}${node.name}`,
      path: node.path || node.name,
    })),
    [flattenedTree]
  );

  const filteredProductCategoryOptions = useMemo(() => {
    const query = String(editingProductCategoryQuery || '').trim().toLowerCase();
    if (!query) return productCategoryOptions.slice(0, 40);
    return productCategoryOptions
      .filter((option) => {
        const path = String(option.path || '').toLowerCase();
        const label = String(option.label || '').toLowerCase();
        return path.includes(query) || label.includes(query);
      })
      .slice(0, 40);
  }, [editingProductCategoryQuery, productCategoryOptions]);

  const diagram = useMemo(() => {
    const levels = [];
    const edges = [];
    const visit = (node, depth = 0, parent = null) => {
      if (!levels[depth]) levels[depth] = [];
      levels[depth].push(node);
      if (parent) edges.push({ from: parent.id, to: node.id });
      (node.children || []).forEach((child) => visit(child, depth + 1, node));
    };
    categoryTree.forEach((root) => visit(root, 0, null));

    const positions = new Map();
    const levelWidth = 230;
    const rowHeight = 110;
    levels.forEach((level, depth) => {
      level.forEach((node, index) => {
        positions.set(Number(node.id), {
          id: Number(node.id),
          x: 80 + (depth * levelWidth),
          y: 40 + (index * rowHeight),
          name: node.name,
          count: Number(node.product_count || 0),
          total: Number(node.total_product_count || 0),
        });
      });
    });

    const maxRows = Math.max(1, ...levels.map((level) => level.length));
    return {
      width: Math.max(480, (levels.length * levelWidth) + 220),
      height: Math.max(280, (maxRows * rowHeight) + 120),
      nodes: Array.from(positions.values()),
      edges: edges
        .map((edge) => ({
          ...edge,
          fromPos: positions.get(Number(edge.from)),
          toPos: positions.get(Number(edge.to)),
        }))
        .filter((edge) => edge.fromPos && edge.toPos),
    };
  }, [categoryTree]);

  const clearStatusAfterDelay = () => {
    setTimeout(() => {
      setSuccess('');
      setError('');
    }, 2400);
  };

  const focusCategoryForm = () => {
    if (formSectionRef.current) {
      formSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => {
      if (nameInputRef.current) nameInputRef.current.focus();
    }, 80);
  };

  const fetchCategories = async ({ keepSelection = true } = {}) => {
    try {
      const [flatRows, treeRows] = await Promise.all([
        categoriesApi.getAll({ scope: 'all' }),
        categoriesApi.getTree(),
      ]);
      const nextFlat = Array.isArray(flatRows) ? flatRows : [];
      const nextTree = Array.isArray(treeRows) ? treeRows : [];
      setCategories(nextFlat);
      setCategoryTree(nextTree);
      setError('');

      setExpandedMap((prev) => {
        const next = { ...prev };
        const walk = (nodes) => {
          nodes.forEach((node) => {
            if (!Object.prototype.hasOwnProperty.call(next, node.id)) next[node.id] = true;
            if (Array.isArray(node.children) && node.children.length) walk(node.children);
          });
        };
        walk(nextTree);
        return next;
      });

      const existingSelection = keepSelection ? toNumericId(selectedCategoryId) : null;
      const selectedStillExists = existingSelection && nextFlat.some((row) => Number(row.id) === existingSelection);
      if (selectedStillExists) {
        setSelectedCategoryId(existingSelection);
      } else if (nextFlat.length > 0) {
        setSelectedCategoryId(Number(nextFlat[0].id));
      } else {
        setSelectedCategoryId(null);
      }
    } catch (fetchError) {
      setError(`Failed to fetch categories: ${fetchError.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategoryProducts = async (categoryId) => {
    const id = toNumericId(categoryId);
    if (!id) {
      setCategoryProducts([]);
      return;
    }
    setProductsLoading(true);
    try {
      const rows = await categoriesApi.getProducts(id, { include_inactive: 'true' });
      setCategoryProducts(Array.isArray(rows) ? rows : []);
    } catch (fetchError) {
      setError(fetchError.message || 'Failed to fetch category products');
      setCategoryProducts([]);
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories({ keepSelection: false });
  }, []);

  useEffect(() => {
    fetchCategoryProducts(selectedCategoryId);
  }, [selectedCategoryId]);

  useEffect(() => {
    if (!Number(editingProductId)) return;
    if (!filteredProductCategoryOptions.length) {
      setEditingProductCategoryFocusIndex(-1);
      return;
    }
    const selectedIndex = filteredProductCategoryOptions.findIndex(
      (option) => Number(option.id) === Number(editingProductCategoryId)
    );
    if (selectedIndex >= 0) {
      setEditingProductCategoryFocusIndex(selectedIndex);
      return;
    }
    setEditingProductCategoryFocusIndex(0);
  }, [editingProductId, editingProductCategoryId, filteredProductCategoryOptions]);

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({
      name: '',
      description: '',
      parent_id: '',
      icon: '',
      image: '',
      image_width: '',
      image_height: '',
    });
    setFormErrors({});
  };

  const validateForm = () => {
    const nextErrors = {};
    const trimmedName = String(formData.name || '').trim();
    if (!trimmedName) {
      nextErrors.name = 'Category name is required';
    } else if (trimmedName.length < 2) {
      nextErrors.name = 'Category name must be at least 2 characters';
    }

    const icon = String(formData.icon || '').trim();
    if (icon.length > 32) {
      nextErrors.icon = 'Icon text must be 32 characters or less';
    }

    const image = String(formData.image || '').trim();
    if (image && !(/^https?:\/\//i.test(image) || image.startsWith('/'))) {
      nextErrors.image = 'Use an absolute URL (http/https) or root-relative path (/...)';
    }

    const imageWidth = String(formData.image_width || '').trim();
    const imageHeight = String(formData.image_height || '').trim();
    if (imageWidth) {
      const widthValue = Number(imageWidth);
      if (!Number.isFinite(widthValue) || widthValue < 16 || widthValue > 4096) {
        nextErrors.image_width = 'Width must be between 16 and 4096';
      }
    }
    if (imageHeight) {
      const heightValue = Number(imageHeight);
      if (!Number.isFinite(heightValue) || heightValue < 16 || heightValue > 4096) {
        nextErrors.image_height = 'Height must be between 16 and 4096';
      }
    }

    const parentId = toNumericId(formData.parent_id);
    if (editingId && parentId && Number(parentId) === Number(editingId)) {
      nextErrors.parent_id = 'A category cannot be its own parent';
    }
    if (editingId && parentId && isDescendantOf(parentId, editingId)) {
      nextErrors.parent_id = 'Cannot move category inside its own subtree';
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        name: String(formData.name || '').trim(),
        description: String(formData.description || '').trim() || null,
        parent_id: toNumericId(formData.parent_id),
        icon: String(formData.icon || '').trim() || null,
        image: String(formData.image || '').trim() || null,
        image_width: String(formData.image_width || '').trim() ? Number(formData.image_width) : null,
        image_height: String(formData.image_height || '').trim() ? Number(formData.image_height) : null,
      };
      if (isEditing && editingId) {
        await categoriesApi.update(editingId, payload);
        setSuccess('Category updated successfully');
      } else {
        await categoriesApi.create(payload);
        setSuccess('Category created successfully');
      }
      resetForm();
      await fetchCategories();
      clearStatusAfterDelay();
    } catch (submitError) {
      setError(submitError.message || 'Failed to save category');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (category) => {
    setIsEditing(true);
    setEditingId(Number(category.id));
    setFormData({
      name: String(category.name || ''),
      description: String(category.description || ''),
      parent_id: category.parent_id ? String(category.parent_id) : '',
      icon: String(category.icon || ''),
      image: String(category.image || ''),
      image_width: category.image_width ? String(category.image_width) : '',
      image_height: category.image_height ? String(category.image_height) : '',
    });
    setFormErrors({});
    focusCategoryForm();
  };

  const handleDelete = async (id) => {
    const category = categories.find((entry) => Number(entry.id) === Number(id));
    const name = String(category?.name || 'this category');
    if (!window.confirm(`Delete "${name}"? This is blocked if it has children or linked products.`)) {
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await categoriesApi.delete(id);
      setSuccess('Category deleted successfully');
      if (Number(selectedCategoryId) === Number(id)) setSelectedCategoryId(null);
      await fetchCategories();
      clearStatusAfterDelay();
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete category');
    } finally {
      setLoading(false);
    }
  };

  const handleSetParent = (parentId) => {
    setIsEditing(false);
    setEditingId(null);
    setFormErrors({});
    setFormData({
      name: '',
      description: '',
      parent_id: parentId ? String(parentId) : '',
      icon: '',
      image: '',
      image_width: '',
      image_height: '',
    });
    focusCategoryForm();
  };

  const handleSelectCategory = (categoryId) => {
    setSelectedCategoryId(Number(categoryId));
  };

  const toggleExpanded = (categoryId) => {
    setExpandedMap((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  const handleDropProductOnCategory = async (targetCategoryId) => {
    const productId = toNumericId(dragProductId);
    const categoryId = toNumericId(targetCategoryId);
    if (!productId || !categoryId) return;
    setDragProductId(null);
    try {
      await categoriesApi.assignProduct(productId, categoryId);
      setSuccess('Product category updated');
      await fetchCategories();
      await fetchCategoryProducts(selectedCategoryId);
      clearStatusAfterDelay();
    } catch (dropError) {
      setError(dropError.message || 'Failed to move product to category');
      clearStatusAfterDelay();
    }
  };

  const startEditingProductCategory = (product) => {
    const productId = toNumericId(product?.id);
    if (!productId) return;
    const currentCategoryId = toNumericId(product?.category_id);
    const matchedOption = productCategoryOptions.find((option) => Number(option.id) === Number(currentCategoryId));
    setEditingProductId(productId);
    setEditingProductCategoryId(currentCategoryId ? String(currentCategoryId) : '');
    setEditingProductCategoryQuery(
      String(
        matchedOption?.path
        || product?.category_path
        || product?.category
        || ''
      ).trim()
    );
    setEditingProductCategoryFocusIndex(-1);
    setTimeout(() => {
      if (productCategoryInputRef.current) productCategoryInputRef.current.focus();
    }, 40);
  };

  const cancelEditingProductCategory = () => {
    setEditingProductId(null);
    setEditingProductCategoryId('');
    setEditingProductCategoryQuery('');
    setEditingProductCategoryFocusIndex(-1);
  };

  const chooseEditingProductCategory = (categoryId) => {
    const numericId = toNumericId(categoryId);
    if (!numericId) return;
    const matchedOption = productCategoryOptions.find((option) => Number(option.id) === numericId);
    setEditingProductCategoryId(String(numericId));
    if (matchedOption) setEditingProductCategoryQuery(String(matchedOption.path || matchedOption.label || '').trim());
  };

  const handleEditingCategoryQueryChange = (event) => {
    const query = String(event.target.value || '');
    setEditingProductCategoryQuery(query);
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      setEditingProductCategoryId('');
      setEditingProductCategoryFocusIndex(-1);
      return;
    }
    const exactMatch = productCategoryOptions.find((option) => {
      const path = String(option.path || '').trim().toLowerCase();
      const label = String(option.label || '').trim().toLowerCase();
      return normalized === path || normalized === label;
    });
    setEditingProductCategoryId(exactMatch ? String(exactMatch.id) : '');
    setEditingProductCategoryFocusIndex(0);
  };

  const handleEditingCategoryQueryKeyDown = (event) => {
    if (!Number(editingProductId)) return;
    const options = filteredProductCategoryOptions;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditingProductCategory();
      return;
    }
    if (!options.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setEditingProductCategoryFocusIndex((prev) => {
        if (prev < 0) return 0;
        return (prev + 1) % options.length;
      });
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setEditingProductCategoryFocusIndex((prev) => {
        if (prev < 0) return options.length - 1;
        return (prev - 1 + options.length) % options.length;
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const safeIndex = editingProductCategoryFocusIndex >= 0
        ? editingProductCategoryFocusIndex
        : 0;
      const highlighted = options[safeIndex];
      if (highlighted) chooseEditingProductCategory(highlighted.id);
    }
  };

  const saveProductCategoryEdit = async (product) => {
    const productId = toNumericId(product?.id);
    const targetCategoryId = toNumericId(editingProductCategoryId);
    if (!productId) return;
    if (!targetCategoryId) {
      setError('Please select a valid target category');
      clearStatusAfterDelay();
      return;
    }

    setSavingProductEdit(true);
    setError('');
    try {
      await categoriesApi.assignProduct(productId, targetCategoryId);
      setSuccess('Product category updated');
      cancelEditingProductCategory();
      await fetchCategories();
      await fetchCategoryProducts(selectedCategoryId);
      clearStatusAfterDelay();
    } catch (saveError) {
      setError(saveError.message || 'Failed to update product category');
      clearStatusAfterDelay();
    } finally {
      setSavingProductEdit(false);
    }
  };

  const renderTreeNode = (node, depth = 0) => {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const expanded = Boolean(expandedMap[node.id]);
    const selected = Number(selectedCategoryId) === Number(node.id);
    return (
      <div key={node.id}>
        <div
          className={`category-tree-node${selected ? ' selected' : ''}`}
          style={{ marginLeft: `${depth * 14}px` }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleDropProductOnCategory(node.id);
          }}
        >
          <button
            type="button"
            className={`tree-expand-btn${hasChildren ? '' : ' empty'}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (hasChildren) toggleExpanded(node.id);
            }}
          >
            {hasChildren ? (expanded ? '-' : '+') : '·'}
          </button>
          <button
            type="button"
            className="tree-node-title"
            onClick={() => handleSelectCategory(node.id)}
            title={node.path || node.name}
          >
            {node.image ? (
              <img
                src={node.image}
                alt=""
                className="tree-node-media"
                width={Number(node.image_width || 20)}
                height={Number(node.image_height || 20)}
                loading="lazy"
              />
            ) : node.icon ? (
              <span className="tree-node-icon">{node.icon}</span>
            ) : null}
            <span className="tree-node-label">{node.name}</span>
          </button>
          <span className="tree-node-count" title="Direct products / Total subtree products">
            {Number(node.product_count || 0)} / {Number(node.total_product_count || 0)}
          </span>
          <div className="tree-node-actions">
            <button
              type="button"
              className="cat-icon-btn cat-edit-btn"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleEdit(node);
              }}
              title="Edit category"
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              className="cat-icon-btn cat-add-btn"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleSetParent(node.id);
              }}
              title="Add child category"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              className="cat-icon-btn cat-delete-btn"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleDelete(node.id);
              }}
              title="Delete category"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {hasChildren && expanded ? node.children.map((child) => renderTreeNode(child, depth + 1)) : null}
      </div>
    );
  };

  return (
    <div className="category-management-overlay">
      <div className="category-management-container fade-in-up">
        <div className="category-management-header">
          <h2>Category Management</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={22} />
          </button>
        </div>

        {error ? <div className="error-message">{error}</div> : null}
        {success ? <div className="success-message">{success}</div> : null}

        <div className="category-toolbar">
          <div className="view-switch">
            <button
              type="button"
              className={activeView === 'tree' ? 'active' : ''}
              onClick={() => setActiveView('tree')}
            >
              <FolderTree size={16} />
              Tree
            </button>
            <button
              type="button"
              className={activeView === 'diagram' ? 'active' : ''}
              onClick={() => setActiveView('diagram')}
            >
              <GitBranch size={16} />
              Diagram
            </button>
          </div>
          <button type="button" className="refresh-btn" onClick={() => fetchCategories()}>
            <RefreshCcw size={15} />
            Refresh
          </button>
        </div>

        <div className="category-management-content">
          <div className="category-form-section" ref={formSectionRef}>
            <h3>{isEditing ? 'Edit Category' : 'Add New Category'}</h3>
            <form onSubmit={handleSubmit} className="category-form">
              <div className="form-group">
                <label htmlFor="name">Category Name *</label>
                <input
                  id="name"
                  name="name"
                  ref={nameInputRef}
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter category name"
                  className={formErrors.name ? 'error' : ''}
                />
                {formErrors.name ? <span className="field-error">{formErrors.name}</span> : null}
              </div>

              <div className="form-group">
                <label htmlFor="parent_id">Parent Category</label>
                <select
                  id="parent_id"
                  name="parent_id"
                  value={formData.parent_id}
                  onChange={handleChange}
                  className={formErrors.parent_id ? 'error' : ''}
                >
                  <option value="">No parent (root category)</option>
                  {parentOptions.map((node) => (
                    <option key={node.id} value={node.id}>
                      {`${'  '.repeat(node.depth)}${node.name}`}
                    </option>
                  ))}
                </select>
                {formErrors.parent_id ? <span className="field-error">{formErrors.parent_id}</span> : null}
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Enter category description"
                  rows="2"
                />
              </div>

               <div className="form-group">
                <label htmlFor="icon">Category Icon (optional)</label>
                <input
                  id="icon"
                  name="icon"
                  value={formData.icon}
                  onChange={handleChange}
                  placeholder="Example: dairy or DRY"
                  className={formErrors.icon ? 'error' : ''}
                />
                {formErrors.icon ? <span className="field-error">{formErrors.icon}</span> : null}
              </div>

              <div className="form-group">
                <label htmlFor="image">Category Image URL (optional)</label>
                <input
                  id="image"
                  name="image"
                  value={formData.image}
                  onChange={handleChange}
                  placeholder="https://... or /uploads/..."
                  className={formErrors.image ? 'error' : ''}
                />
                {formErrors.image ? <span className="field-error">{formErrors.image}</span> : null}
              </div>

              <div className="form-inline-grid">
                <div className="form-group">
                  <label htmlFor="image_width">Image Width</label>
                  <input
                    id="image_width"
                    name="image_width"
                    value={formData.image_width}
                    onChange={handleChange}
                    placeholder="32"
                    inputMode="numeric"
                    className={formErrors.image_width ? 'error' : ''}
                  />
                  {formErrors.image_width ? <span className="field-error">{formErrors.image_width}</span> : null}
                </div>
                <div className="form-group">
                  <label htmlFor="image_height">Image Height</label>
                  <input
                    id="image_height"
                    name="image_height"
                    value={formData.image_height}
                    onChange={handleChange}
                    placeholder="32"
                    inputMode="numeric"
                    className={formErrors.image_height ? 'error' : ''}
                  />
                  {formErrors.image_height ? <span className="field-error">{formErrors.image_height}</span> : null}
                </div>
              </div>

              {(String(formData.image || '').trim() || String(formData.icon || '').trim()) ? (
                <div className="category-media-preview" aria-live="polite">
                  {String(formData.image || '').trim() ? (
                    <img
                      src={String(formData.image || '').trim()}
                      alt=""
                      width={Number(formData.image_width || 28) || 28}
                      height={Number(formData.image_height || 28) || 28}
                      loading="lazy"
                    />
                  ) : (
                    <span>{String(formData.icon || '').trim() || 'C'}</span>
                  )}
                  <small>Preview</small>
                </div>
              ) : null}

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={resetForm} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={loading}>
                  {loading ? 'Saving...' : (isEditing ? 'Update Category' : 'Add Category')}
                </button>
              </div>
            </form>
          </div>

          <div className="categories-workspace">
            <div className="categories-list-section">
              <h3>Categories ({categories.length})</h3>
              {loading && !categories.length ? (
                <div className="loading-message">Loading categories...</div>
              ) : categories.length === 0 ? (
                <div className="empty-message">No categories found. Add one to start building your tree.</div>
              ) : activeView === 'tree' ? (
                <div className="category-tree-list">
                  {categoryTree.map((node) => renderTreeNode(node))}
                </div>
              ) : (
                <div className="diagram-scroll">
                  <svg
                    className="category-diagram"
                    viewBox={`0 0 ${diagram.width} ${diagram.height}`}
                    role="img"
                    aria-label="Category hierarchy diagram"
                  >
                    {diagram.edges.map((edge) => (
                      <line
                        key={`edge-${edge.from}-${edge.to}`}
                        x1={edge.fromPos.x + 138}
                        y1={edge.fromPos.y + 26}
                        x2={edge.toPos.x}
                        y2={edge.toPos.y + 26}
                        className="diagram-edge"
                      />
                    ))}
                    {diagram.nodes.map((node) => {
                      const selected = Number(selectedCategoryId) === Number(node.id);
                      return (
                        <g
                          key={`node-${node.id}`}
                          className={`diagram-node${selected ? ' selected' : ''}`}
                          onClick={() => handleSelectCategory(node.id)}
                        >
                          <rect x={node.x} y={node.y} width="138" height="52" rx="9" />
                          <text x={node.x + 8} y={node.y + 20} className="diagram-node-name">{node.name}</text>
                          <text x={node.x + 8} y={node.y + 38} className="diagram-node-meta">
                            {node.count}/{node.total}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}
            </div>

            <div className="category-products-panel">
              <h3>
                {selectedCategory ? `Products in ${selectedCategory.name}` : 'Category Products'}
              </h3>
              <p className="panel-help">
                Drag a product and drop it on another category node to reassign category directly.
              </p>

              {productsLoading ? (
                <div className="loading-message compact">Loading products...</div>
              ) : !selectedCategory ? (
                <div className="empty-message compact">Select a category to view and drag products.</div>
              ) : categoryProducts.length === 0 ? (
                <div className="empty-message compact">No products in this category.</div>
              ) : (
                <div className="category-products-list">
                  {categoryProducts.map((product) => (
                    <div
                      key={product.id}
                      className={`category-product-item${Number(editingProductId) === Number(product.id) ? ' is-editing' : ''}`}
                      draggable={Number(editingProductId) !== Number(product.id)}
                      onDragStart={() => setDragProductId(product.id)}
                      onDragEnd={() => setDragProductId(null)}
                      onClick={() => startEditingProductCategory(product)}
                    >
                      <span className="product-name">{product.name}</span>
                      <span className="product-meta">
                        #{product.id} | Stock {Number(product.stock || 0)} | {String(product.category_path || product.category || '').trim() || '-'}
                      </span>
                      {Number(editingProductId) === Number(product.id) ? (
                        <div
                          className="product-inline-editor"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="text"
                            id="product-category-search"
                            name="product-category-search"
                            ref={productCategoryInputRef}
                            className="product-category-search-input"
                            placeholder="Type to search categories..."
                            value={editingProductCategoryQuery}
                            onChange={handleEditingCategoryQueryChange}
                            onKeyDown={handleEditingCategoryQueryKeyDown}
                            disabled={savingProductEdit}
                          />
                          <div className="product-category-search-results">
                            {filteredProductCategoryOptions.length === 0 ? (
                              <div className="product-category-no-results">No category matches</div>
                            ) : (
                              filteredProductCategoryOptions.map((option, index) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  className={`product-category-option${Number(editingProductCategoryId) === Number(option.id) ? ' selected' : ''}${index === editingProductCategoryFocusIndex ? ' highlighted' : ''}`}
                                  onClick={() => chooseEditingProductCategory(option.id)}
                                  onMouseEnter={() => setEditingProductCategoryFocusIndex(index)}
                                  disabled={savingProductEdit}
                                  title={option.path}
                                >
                                  {option.path}
                                </button>
                              ))
                            )}
                          </div>
                          <div className="product-inline-actions">
                            <button
                              type="button"
                              className="inline-cancel-btn"
                              onClick={cancelEditingProductCategory}
                              disabled={savingProductEdit}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="inline-save-btn"
                              onClick={() => saveProductCategoryEdit(product)}
                              disabled={savingProductEdit}
                            >
                              {savingProductEdit ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CategoryManagement;
