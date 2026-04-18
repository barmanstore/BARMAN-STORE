const CategoryFormPanel = ({
  formSectionRef,
  nameInputRef,
  isEditing,
  formData,
  formErrors,
  parentOptions,
  loading,
  onSubmit,
  onChange,
  onReset,
}) => (
  <div className="category-form-section" ref={formSectionRef}>
    <h3>{isEditing ? 'Edit Category' : 'Add New Category'}</h3>
    <form onSubmit={onSubmit} className="category-form">
      <div className="form-group">
        <label htmlFor="name">Category Name *</label>
        <input
          id="name"
          name="name"
          ref={nameInputRef}
          value={formData.name}
          onChange={onChange}
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
          onChange={onChange}
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
          onChange={onChange}
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
          onChange={onChange}
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
          onChange={onChange}
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
            onChange={onChange}
            placeholder="32"
            inputMode="numeric"
            className={formErrors.image_width ? 'error' : ''}
          />
          {formErrors.image_width ? (
            <span className="field-error">{formErrors.image_width}</span>
          ) : null}
        </div>
        <div className="form-group">
          <label htmlFor="image_height">Image Height</label>
          <input
            id="image_height"
            name="image_height"
            value={formData.image_height}
            onChange={onChange}
            placeholder="32"
            inputMode="numeric"
            className={formErrors.image_height ? 'error' : ''}
          />
          {formErrors.image_height ? (
            <span className="field-error">{formErrors.image_height}</span>
          ) : null}
        </div>
      </div>

      {String(formData.image || '').trim() || String(formData.icon || '').trim() ? (
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
        <button type="button" className="cancel-btn" onClick={onReset} disabled={loading}>
          Cancel
        </button>
        <button type="submit" className="submit-btn" disabled={loading}>
          {loading ? 'Saving...' : isEditing ? 'Update Category' : 'Add Category'}
        </button>
      </div>
    </form>
  </div>
);

export default CategoryFormPanel;
