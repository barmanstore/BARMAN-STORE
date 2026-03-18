import { useEffect, useRef, useState } from 'react';
import { categoriesApi } from '../../../../shared/services/api';
import useLockBodyScroll from '../../../../shared/hooks/useLockBodyScroll';
import useCategoryManagementComputed from './useCategoryManagementComputed';
import useCategoryManagementProducts from './useCategoryManagementProducts';

const toNumericId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const useCategoryManagementController = ({ onClose }) => {
  useLockBodyScroll(true);
  const [categories, setCategories] = useState([]);
  const [categoryTree, setCategoryTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [activeView, setActiveView] = useState('tree');
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [expandedMap, setExpandedMap] = useState({});

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

  const {
    selectedCategory,
    isDescendantOf,
    parentOptions,
    productCategoryOptions,
    diagram,
  } = useCategoryManagementComputed({
    categories,
    categoryTree,
    selectedCategoryId,
    editingId,
  });

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

  useEffect(() => {
    fetchCategories({ keepSelection: false });
  }, []);

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

  const products = useCategoryManagementProducts({
    categoriesApi,
    selectedCategoryId,
    productCategoryOptions,
    setError,
    setSuccess,
    clearStatusAfterDelay,
    fetchCategories,
  });

  return {
    onClose,
    error,
    success,
    activeView,
    onViewChange: setActiveView,
    onRefresh: () => fetchCategories(),
    categories,
    categoryTree,
    loading,
    diagram,
    selectedCategoryId,
    selectedCategory,
    formSectionRef,
    nameInputRef,
    isEditing,
    formData,
    formErrors,
    parentOptions,
    onSubmit: handleSubmit,
    onChange: handleChange,
    onReset: resetForm,
    expandedMap,
    onToggleExpanded: toggleExpanded,
    onSelectCategory: handleSelectCategory,
    onEditCategory: handleEdit,
    onAddChild: handleSetParent,
    onDeleteCategory: handleDelete,
    onDropProduct: products.handleDropProductOnCategory,
    productsLoading: products.productsLoading,
    categoryProducts: products.categoryProducts,
    editingProductId: products.editingProductId,
    editingProductCategoryId: products.editingProductCategoryId,
    editingProductCategoryQuery: products.editingProductCategoryQuery,
    editingProductCategoryFocusIndex: products.editingProductCategoryFocusIndex,
    savingProductEdit: products.savingProductEdit,
    filteredProductCategoryOptions: products.filteredProductCategoryOptions,
    productCategoryInputRef: products.productCategoryInputRef,
    onStartEditing: products.startEditingProductCategory,
    onCategoryQueryChange: products.handleEditingCategoryQueryChange,
    onCategoryQueryKeyDown: products.handleEditingCategoryQueryKeyDown,
    onChooseCategory: products.chooseEditingProductCategory,
    onHoverCategoryIndex: products.setEditingProductCategoryFocusIndex,
    onCancelEditing: products.cancelEditingProductCategory,
    onSaveEdit: products.saveProductCategoryEdit,
    onDragStart: products.handleDragStart,
    onDragEnd: products.handleDragEnd,
  };
};

export default useCategoryManagementController;

