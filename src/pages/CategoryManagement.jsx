import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { categoriesApi } from '../services/api';
import './CategoryManagement.css';

function CategoryManagement({ onClose }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const data = await categoriesApi.getAll();
      setCategories(data);
      setError('');
    } catch (err) {
      setError('Failed to fetch categories: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Category name is required';
    } else if (formData.name.length < 2) {
      newErrors.name = 'Category name must be at least 2 characters';
    }
    
    setFormErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (isEditing) {
        await categoriesApi.update(editingId, formData);
        setSuccess('Category updated successfully');
      } else {
        await categoriesApi.create(formData);
        setSuccess('Category created successfully');
      }
      
      setFormData({ name: '', description: '' });
      setIsEditing(false);
      setEditingId(null);
      fetchCategories();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save category');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (category) => {
    setIsEditing(true);
    setEditingId(category.id);
    setFormData({
      name: category.name,
      description: category.description || ''
    });
    setFormErrors({});
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this category? Products using this category will not be affected.')) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await categoriesApi.delete(id);
      setSuccess('Category deleted successfully');
      fetchCategories();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to delete category');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({ name: '', description: '' });
    setFormErrors({});
  };

  return (
    <div className="category-management-overlay">
      <div className="category-management-container fade-in-up">
        <div className="category-management-header">
          <h2>Category Management</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="category-management-content">
          {/* Category Form */}
          <div className="category-form-section">
            <h3>{isEditing ? 'Edit Category' : 'Add New Category'}</h3>
            <form onSubmit={handleSubmit} className="category-form">
              <div className="form-group">
                <label htmlFor="name">Category Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter category name"
                  className={formErrors.name ? 'error' : ''}
                />
                {formErrors.name && <span className="field-error">{formErrors.name}</span>}
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

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={handleCancel} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={loading}>
                  {loading ? 'Saving...' : (isEditing ? 'Update Category' : 'Add Category')}
                </button>
              </div>
            </form>
          </div>

          {/* Categories List */}
          <div className="categories-list-section">
            <h3>Existing Categories ({categories.length})</h3>
            
            {loading && !categories.length ? (
              <div className="loading-message">Loading categories...</div>
            ) : categories.length === 0 ? (
              <div className="empty-message">No categories found. Create your first category above.</div>
            ) : (
              <div className="categories-grid">
                {categories.map((category) => (
                  <div key={category.id} className="category-card">
                    <div className="category-info">
                      <h4>{category.name}</h4>
                      {category.description && (
                        <p className="category-description">{category.description}</p>
                      )}
                    </div>
                    <div className="category-actions">
                      <button 
                        className="edit-btn" 
                        onClick={() => handleEdit(category)}
                        title="Edit category"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        className="delete-btn" 
                        onClick={() => handleDelete(category.id)}
                        title="Delete category"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CategoryManagement;
