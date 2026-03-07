import { useState, useEffect } from 'react';
import { X, Package, QrCode, Plus, Trash2 } from 'lucide-react';
import { productsApi, categoriesApi } from '../services/api';
import { getProductImageSrc } from '../utils/productImage';
import ImageUrlPicker from '../components/ImageUrlPicker';
import useIsMobile from '../hooks/useIsMobile';
import MobileBottomSheet from '../components/mobile/MobileBottomSheet';
import './ProductForm.css';

function ProductForm({ product, onClose, onSave, mode = 'full' }) {
  const isQuickMode = mode === 'quick';
  const splitCommaValues = (value) => String(value ?? '')
    .split(',')
    .map((part) => String(part || '').trim())
    .filter(Boolean);

  const firstCommaValue = (value) => splitCommaValues(value)[0] || '';
  const joinCommaValues = (values = []) => values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(',');

  const getPricingVariantCount = (data) => Math.max(
    1,
    splitCommaValues(data?.price).length,
    splitCommaValues(data?.mrp).length
  );

  const pickVariantValueLoose = (values, index, variantCount) => {
    if (!values.length) return '';
    if (values.length === 1) return values[0];
    if (values.length === variantCount) return values[index];
    return values[Math.min(index, values.length - 1)] || '';
  };

  const createInitialFormData = () => ({
    name: '',
    description: '',
    brand: '',
    content: '',
    color: '',
    price: '',
    mrp: '',
    uom: 'pcs',
    base_unit: 'pcs',
    uom_type: 'selling',
    conversion_factor: '1',
    barcode: '',
    sku: '',
    image: '',
    stock: '',
    expiry_date: '',
    category: '',
    defaultDiscount: '',
    discountType: 'fixed'
  });
  const [formData, setFormData] = useState(createInitialFormData());
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [batchProducts, setBatchProducts] = useState([]);
  const [isDescriptionAuto, setIsDescriptionAuto] = useState(true);
  const [isContentAutoFromPrice, setIsContentAutoFromPrice] = useState(false);
  const [isStockAutoFromPrice, setIsStockAutoFromPrice] = useState(false);
  const isMobile = useIsMobile();
  const [showAdvancedFields, setShowAdvancedFields] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth > 768;
  });

  // UOM options for groceries
  const uomOptions = [
    { value: 'pcs', label: 'Pieces (pcs)' },
    { value: 'kg', label: 'Kilogram (kg)' },
    { value: 'g', label: 'Gram (g)' },
    { value: 'l', label: 'Liter (l)' },
    { value: 'ml', label: 'Milliliter (ml)' },
    { value: 'box', label: 'Box' },
    { value: 'pack', label: 'Pack' },
    { value: 'case', label: 'Case (24 pcs)' },
    { value: 'dozen', label: 'Dozen (12 pcs)' }
  ];

  useEffect(() => {
    fetchCategories();
    if (product) {
      setFormData({
        name: product.name || '',
        description: product.description || '',
        brand: product.brand_path || product.brand || '',
        content: product.content || '',
        color: product.color || '',
        price: product.price?.toString() || '',
        mrp: product.mrp?.toString() || '',
        uom: product.uom || 'pcs',
        base_unit: product.base_unit || 'pcs',
        uom_type: product.uom_type || 'selling',
        conversion_factor: product.conversion_factor?.toString() || '1',
        barcode: product.barcode || '',
        sku: product.sku || '',
        image: product.image || '',
        stock: product.stock?.toString() || '',
        expiry_date: product.expiry_date || '',
        category: product.category_path || product.category || '',
        defaultDiscount: product.defaultDiscount?.toString() || '',
        discountType: product.discountType || 'fixed'
      });
      setIsDescriptionAuto(false);
      setIsContentAutoFromPrice(false);
      setIsStockAutoFromPrice(false);
      setShowAdvancedFields(true);
    } else {
      setFormData(createInitialFormData());
      setBatchProducts([]);
      setIsDescriptionAuto(true);
      setIsContentAutoFromPrice(false);
      setIsStockAutoFromPrice(false);
      setShowAdvancedFields(isQuickMode ? false : !isMobile);
    }
  }, [product, isMobile, isQuickMode]);

  const fetchCategories = async () => {
    try {
      const data = await categoriesApi.getAll();
      setCategories(data);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  // Auto-generate SKU when relevant fields change
  const generateAutoSKU = (data = formData, variantIndex = 0) => {
    const sanitize = (v) => String(v || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const namePart = sanitize(firstCommaValue(data.name)).slice(0, 4).padEnd(4, 'X');
    const brandPart = sanitize(firstCommaValue(data.brand)).slice(0, 4).padEnd(4, 'X');
    const contentPart = sanitize(firstCommaValue(data.content)).slice(0, 2).padEnd(2, 'X');
    const priceRounded = Math.round(parseFloat(firstCommaValue(data.price)) || parseFloat(firstCommaValue(data.mrp)) || 0);
    const pricePart = String(priceRounded).replace(/\D/g, '').slice(-4).padStart(4, '0');
    const baseSku = `${namePart}${brandPart}${contentPart}${pricePart}`;
    if (variantIndex > 0) return `${baseSku}${String(variantIndex + 1).padStart(2, '0')}`;
    return baseSku;
  };

  const generateDescriptionSuggestion = (data = formData) => {
    const name = (data.name || '').trim();
    if (!name) return '';

    const brand = (data.brand || '').trim();
    const content = (data.content || '').trim();
    const category = (data.category || '').trim();
    const color = (data.color || '').trim();

    const parts = [name];
    if (brand) parts.push(`by ${brand}`);
    if (content) parts.push(`(${content})`);

    let description = parts.join(' ');
    if (category) description += ` in ${category} category`;
    if (color) description += `, ${color} variant`;
    description += '. Quality product for daily use.';

    return description;
  };

  const prepareFormDataForSubmit = (data) => {
    if (!isQuickMode) return data;
    const prepared = { ...data };
    if (!String(prepared.description || '').trim()) {
      prepared.description = generateDescriptionSuggestion(prepared) || String(prepared.name || '').trim();
    }
    if (!String(prepared.stock || '').trim()) {
      prepared.stock = '0';
    }
    if (!String(prepared.base_unit || '').trim()) {
      prepared.base_unit = prepared.uom || 'pcs';
    }
    if (!String(prepared.mrp || '').trim()) {
      prepared.mrp = prepared.price;
    }
    return prepared;
  };

  const handleSuggestDescription = () => {
    const suggested = generateDescriptionSuggestion(formData);
    if (!suggested) return;
    setFormData(prev => ({ ...prev, description: suggested }));
    setIsDescriptionAuto(true);
  };

  const validateFormData = (data) => {
    const newErrors = {};
    
    if (!data.name.trim()) {
      newErrors.name = 'Product name is required';
    }
    
    if (!data.description.trim()) {
      newErrors.description = 'Description is required';
    }
    
    if (!data.price || parseFloat(data.price) <= 0) {
      newErrors.price = 'Price must be a positive number';
    }
    
    if (!String(data.category || '').trim()) {
      newErrors.category = 'Category is required';
    }
    
    if (!data.stock || parseInt(data.stock) < 0) {
      newErrors.stock = 'Stock must be a non-negative number';
    }

    const conversionFactor = Number(data.conversion_factor);
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
      newErrors.conversion_factor = 'Conversion factor must be greater than 0';
    }
    return newErrors;
  };

  const buildProductData = (data) => ({
    name: data.name.trim(),
    description: data.description.trim(),
    brand: data.brand.trim(),
    content: data.content.trim(),
    color: data.color.trim(),
    price: parseFloat(data.price),
    mrp: parseFloat(data.mrp) || parseFloat(data.price),
    uom: data.uom,
    base_unit: data.base_unit,
    uom_type: data.uom_type,
    barcode: data.barcode.trim(),
    sku: data.sku,
    image: data.image.trim(),
    stock: parseInt(data.stock),
    conversion_factor: parseFloat(data.conversion_factor) || 1,
    expiry_date: data.expiry_date || null,
    category: String(data.category || '').trim(),
    defaultDiscount: parseFloat(data.defaultDiscount) || 0,
    discountType: data.discountType
  });

  const buildVariantFormRows = (data = formData) => {
    const lists = {
      price: splitCommaValues(data.price),
      mrp: splitCommaValues(data.mrp),
      stock: splitCommaValues(data.stock),
      content: splitCommaValues(data.content),
      color: splitCommaValues(data.color),
      sku: splitCommaValues(data.sku),
      barcode: splitCommaValues(data.barcode),
    };
    const variantCount = Math.max(
      1,
      lists.price.length,
      lists.mrp.length,
      lists.stock.length,
      lists.content.length,
      lists.color.length,
      lists.sku.length,
      lists.barcode.length
    );

    const pickValue = (name, index) => {
      const values = lists[name];
      if (!values.length) return '';
      if (values.length === 1) return values[0];
      if (values.length === variantCount) return values[index];
      throw new Error(`Field "${name}" must have either 1 value or ${variantCount} comma-separated values.`);
    };

    const rows = [];
    for (let i = 0; i < variantCount; i += 1) {
      const row = {
        ...data,
        price: pickValue('price', i),
        stock: pickValue('stock', i),
        content: pickValue('content', i),
        color: pickValue('color', i),
      };
      const mrpValue = pickValue('mrp', i);
      row.mrp = mrpValue || row.price;
      if (!row.content && variantCount > 1) {
        row.content = row.price || row.mrp || '';
      }
      if (!row.stock && variantCount > 1) {
        row.stock = '0';
      }
      row.barcode = pickValue('barcode', i);
      const suppliedSku = pickValue('sku', i);
      row.sku = suppliedSku || generateAutoSKU(row, i);
      rows.push(row);
    }

    const distinctPrices = new Set(
      rows.map((row) => String(row.price || '').trim()).filter(Boolean)
    );
    if (variantCount > 1 && distinctPrices.size > 1) {
      const contents = rows.map((row) => String(row.content || '').trim());
      const allContentPresent = contents.every(Boolean);
      const uniqueContents = new Set(contents.map((value) => value.toLowerCase()));
      if (!allContentPresent || uniqueContents.size !== rows.length) {
        throw new Error('When multiple prices are provided, each variant must have a different non-empty content/size value.');
      }
    }

    const normalizedSkus = rows.map((row) => String(row.sku || '').trim().toLowerCase()).filter(Boolean);
    if (normalizedSkus.length !== new Set(normalizedSkus).size) {
      throw new Error('Each variant must have a unique SKU.');
    }

    return rows;
  };

  const hasFormDraft = (data = formData) => {
    return ['name', 'description', 'brand', 'content', 'color', 'price', 'mrp', 'barcode', 'sku', 'image', 'stock', 'expiry_date', 'category', 'defaultDiscount']
      .some((field) => String(data[field] || '').trim() !== '');
  };

  const handleAddToBatch = () => {
    setError('');
    let variantRows = [];
    try {
      variantRows = buildVariantFormRows(prepareFormDataForSubmit(formData));
    } catch (err) {
      setError(err.message || 'Invalid variant input');
      return;
    }
    const validationMessages = [];
    variantRows.forEach((row, index) => {
      const variantErrors = validateFormData(row);
      if (Object.keys(variantErrors).length) {
        validationMessages.push(`Variant ${index + 1}: ${Object.values(variantErrors).join(', ')}`);
      }
    });
    if (validationMessages.length) {
      setError(validationMessages[0]);
      return;
    }

    const payloads = variantRows.map((row) => buildProductData(row));
    setBatchProducts((prev) => [...prev, ...payloads]);
    setFormData((prev) => ({
      ...createInitialFormData(),
      category: prev.category || '',
      uom: prev.uom || 'pcs',
      base_unit: prev.base_unit || 'pcs',
      uom_type: prev.uom_type || 'selling'
    }));
    setErrors({});
    setIsDescriptionAuto(true);
  };

  const handleRemoveBatchItem = (index) => {
    setBatchProducts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleClearBatch = () => {
    setBatchProducts([]);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextFormData = { ...formData, [name]: value };

    if (name === 'content') {
      setIsContentAutoFromPrice(false);
    }

    if (name === 'stock') {
      setIsStockAutoFromPrice(false);
    }
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    
    const pricingVariantCount = getPricingVariantCount(nextFormData);
    if (['price', 'mrp'].includes(name) && pricingVariantCount > 1) {
      if (isContentAutoFromPrice || splitCommaValues(nextFormData.content).length === 0) {
        const priceValues = splitCommaValues(nextFormData.price);
        const mrpValues = splitCommaValues(nextFormData.mrp);
        const contentDefaults = [];
        for (let i = 0; i < pricingVariantCount; i += 1) {
          const seededContent = pickVariantValueLoose(priceValues, i, pricingVariantCount)
            || pickVariantValueLoose(mrpValues, i, pricingVariantCount);
          if (seededContent) contentDefaults.push(seededContent);
        }
        nextFormData.content = joinCommaValues(contentDefaults);
        setIsContentAutoFromPrice(true);
      }
      if (isStockAutoFromPrice || splitCommaValues(nextFormData.stock).length === 0) {
        nextFormData.stock = Array(pricingVariantCount).fill('0').join(',');
        setIsStockAutoFromPrice(true);
      }
    }

    // Auto-generate SKU when relevant fields change
    if (['name', 'brand', 'content', 'price', 'mrp'].includes(name)) {
      const contentValues = splitCommaValues(nextFormData.content);
      const priceValues = splitCommaValues(nextFormData.price);
      const mrpValues = splitCommaValues(nextFormData.mrp);
      const skuVariantCount = Math.max(1, contentValues.length, priceValues.length, mrpValues.length);
      const skuList = [];
      for (let i = 0; i < skuVariantCount; i += 1) {
        const row = {
          ...nextFormData,
          content: pickVariantValueLoose(contentValues, i, skuVariantCount)
            || pickVariantValueLoose(priceValues, i, skuVariantCount)
            || pickVariantValueLoose(mrpValues, i, skuVariantCount),
          price: pickVariantValueLoose(priceValues, i, skuVariantCount),
          mrp: pickVariantValueLoose(mrpValues, i, skuVariantCount),
        };
        skuList.push(generateAutoSKU(row, i));
      }
      nextFormData.sku = skuVariantCount > 1 ? skuList.join(',') : (skuList[0] || '');
    }

    if (name === 'description') {
      setIsDescriptionAuto(false);
    }

    if (['name', 'brand', 'content', 'category', 'color'].includes(name)) {
      if (!nextFormData.description.trim() || isDescriptionAuto) {
        const suggested = generateDescriptionSuggestion(nextFormData);
        if (suggested) {
          nextFormData.description = suggested;
          setIsDescriptionAuto(true);
        }
      }
    }

    setFormData(nextFormData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    setLoading(true);

    try {
      const submitWithIdenticalChoice = async ({ mode, payload, id }) => {
        const send = (allowIdentical = false) => {
          const body = allowIdentical ? { ...payload, allow_identical: true } : payload;
          return mode === 'update'
            ? productsApi.update(id, body)
            : productsApi.create(body);
        };

        try {
          return await send(false);
        } catch (err) {
          const conflictType = String(err?.payload?.conflict_type || '');
          if (Number(err?.status) === 409 && conflictType === 'identical') {
            const ok = window.confirm(`${err.message}\n\nDo you want to continue anyway?`);
            if (!ok) throw err;
            return send(true);
          }
          throw err;
        }
      };

      if (product) {
        const savedProducts = [];
        let variantRows = [];
        try {
          variantRows = buildVariantFormRows(prepareFormDataForSubmit(formData));
        } catch (err) {
          setError(err.message || 'Invalid variant input');
          return;
        }
        const validationMessages = [];
        variantRows.forEach((row, index) => {
          const variantErrors = validateFormData(row);
          if (Object.keys(variantErrors).length) {
            validationMessages.push(`Variant ${index + 1}: ${Object.values(variantErrors).join(', ')}`);
          }
        });
        if (validationMessages.length) {
          setError(validationMessages[0]);
          return;
        }

        const payloads = variantRows.map((row) => buildProductData(row));
        const updatedProduct = await submitWithIdenticalChoice({ mode: 'update', id: product.id, payload: payloads[0] });
        if (updatedProduct) savedProducts.push(updatedProduct);
        for (let i = 1; i < payloads.length; i += 1) {
          const createdProduct = await submitWithIdenticalChoice({ mode: 'create', payload: payloads[i] });
          if (createdProduct) savedProducts.push(createdProduct);
        }
        if (payloads.length > 1) {
          await onSave({
            mode: 'edit_split',
            createdCount: payloads.length - 1,
            updatedCount: 1,
            savedProducts,
            createdProducts: savedProducts.slice(1),
          });
        } else {
          await onSave({
            mode: 'edit',
            createdCount: 0,
            savedProducts,
            updatedProduct,
          });
        }
      } else {
        const payloads = [...batchProducts];
        if (hasFormDraft(formData)) {
          let variantRows = [];
          try {
            variantRows = buildVariantFormRows(prepareFormDataForSubmit(formData));
          } catch (err) {
            setError(err.message || 'Invalid variant input');
            return;
          }
          const validationMessages = [];
          variantRows.forEach((row, index) => {
            const variantErrors = validateFormData(row);
            if (Object.keys(variantErrors).length) {
              validationMessages.push(`Variant ${index + 1}: ${Object.values(variantErrors).join(', ')}`);
            }
          });
          if (validationMessages.length) {
            setError(validationMessages[0]);
            return;
          }
          payloads.push(...variantRows.map((row) => buildProductData(row)));
        }
        if (!payloads.length) {
          setError('Add at least one product to submit');
          return;
        }

        const createdProducts = [];
        let createdCount = 0;
        for (let i = 0; i < payloads.length; i += 1) {
          try {
            const createdProduct = await submitWithIdenticalChoice({ mode: 'create', payload: payloads[i] });
            if (createdProduct) createdProducts.push(createdProduct);
            createdCount += 1;
          } catch (err) {
            if (createdCount > 0) {
              await onSave({
                mode: 'create_partial',
                createdCount,
                createdProducts,
                savedProducts: createdProducts,
              });
            }
            setError(`Failed at product ${i + 1} (${payloads[i].name}): ${err.message || 'Create failed'}. Created ${createdCount} product(s).`);
            return;
          }
        }
        await onSave({
          mode: 'create',
          createdCount: payloads.length,
          createdProducts,
          savedProducts: createdProducts,
        });
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!product;
  const visibleAdvancedFields = showAdvancedFields && !isQuickMode;
  const formHeading = isEditing ? 'Edit Product' : (isQuickMode ? 'Quick Add Product' : 'Add New Product');

  const formContent = (
    <>
      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit} className={`product-form${isQuickMode ? ' compact-product-form' : ''}`}>
          {!isEditing && !isQuickMode && (
            <div className="form-section batch-section">
              <h3 className="section-title">Batch Add Products</h3>
              <p className="batch-help">
                Fill product details and click <strong>Add To Batch</strong>. You can submit all queued products at once.
              </p>
              <div className="batch-actions">
                <button type="button" className="submit-btn batch-add-btn" onClick={handleAddToBatch} disabled={loading}>
                  <Plus size={16} /> Add To Batch
                </button>
              </div>
              {batchProducts.length > 0 && (
                <div className="batch-summary-bar">
                  <span>{batchProducts.length} product(s) queued for one-click save</span>
                  <button type="button" className="batch-clear-btn" onClick={handleClearBatch}>
                    Clear Queue
                  </button>
                </div>
              )}
              {batchProducts.length > 0 && (
                <div className="batch-list">
                  {batchProducts.map((item, index) => (
                    <div key={`${item.name}-${index}`} className="batch-item">
                      <div className="batch-item-info">
                        <strong>{item.name}</strong>
                        <span>{item.category} | Rs {Number(item.price || 0).toFixed(2)} | Stock: {item.stock}</span>
                      </div>
                      <button type="button" className="batch-item-remove" onClick={() => handleRemoveBatchItem(index)} title="Remove">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isQuickMode && (
            <div className="advanced-fields-toggle">
            <button
              type="button"
              className="advanced-toggle-btn"
              onClick={() => setShowAdvancedFields((prev) => !prev)}
            >
              {showAdvancedFields ? 'Hide advanced fields' : 'Show advanced fields'}
            </button>
            <small className="field-help">Advanced: UOM conversion, SKU and barcode.</small>
          </div>
          )}

          {/* Basic Information Section */}
          <div className="form-section">
            <h3 className="section-title">{isQuickMode ? 'Quick Product Details' : 'Basic Information'}</h3>
            
            <div className="form-group">
              <label htmlFor="name">Product Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter product name"
                className={`input-field ${errors.name ? 'error' : ''}`}
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </div>

            {!isQuickMode ? (
            <div className="form-group">
              <div className="description-header">
                <label htmlFor="description">Description *</label>
                <button type="button" className="suggest-description-btn" onClick={handleSuggestDescription}>
                  Suggest
                </button>
              </div>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Enter product description"
                rows="3"
                className={`input-field ${errors.description ? 'error' : ''}`}
              />
              <small className="field-help">Description is auto-suggested from product name. You can edit it anytime.</small>
              {errors.description && <span className="field-error">{errors.description}</span>}
            </div>
            ) : (
            <div className="compact-product-grid">
              <div className="form-group compact-span-2">
                <label htmlFor="category">Category *</label>
                <input
                  type="text"
                  id="category"
                  name="category"
                  list="product-form-category-list"
                  value={formData.category}
                  onChange={handleChange}
                  placeholder="Groceries -> Dairy"
                  className={`input-field ${errors.category ? 'error' : ''}`}
                />
                <datalist id="product-form-category-list">
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name} />
                  ))}
                </datalist>
                {errors.category && <span className="field-error">{errors.category}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="brand">Brand</label>
                <input
                  type="text"
                  id="brand"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  placeholder="Optional brand"
                  className="input-field"
                />
              </div>

              <div className="form-group">
                <label htmlFor="price">Price *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  id="price"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  placeholder="0.00"
                  className={`input-field ${errors.price ? 'error' : ''}`}
                />
                {errors.price && <span className="field-error">{errors.price}</span>}
              </div>

              <div className="form-group compact-span-2">
                <label htmlFor="uom">UOM *</label>
                <select
                  id="uom"
                  name="uom"
                  value={formData.uom}
                  onChange={handleChange}
                  className="input-field"
                >
                  {uomOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            )}

            {!isQuickMode && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="brand">Brand</label>
                <input
                  type="text"
                  id="brand"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  placeholder="e.g., Nescafe, Parle"
                  className="input-field"
                />
                <small className="field-help">Optional format: Parent {'->'} Child. Example: Dove {'->'} Baby Care.</small>
              </div>

              <div className="form-group">
                <label htmlFor="content">Content/Size</label>
                <input
                  type="text"
                  id="content"
                  name="content"
                  value={formData.content}
                  onChange={handleChange}
                  placeholder="e.g., 250g, 1L, 500ml"
                  className="input-field"
                />
                <small className="field-help">Multiple variants: use comma values, e.g. `250g,500g,1kg`.</small>
              </div>
            </div>
            )}

            {!isQuickMode && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="color">Color</label>
                <input
                  type="text"
                  id="color"
                  name="color"
                  value={formData.color}
                  onChange={handleChange}
                  placeholder="e.g., Brown, White, Red"
                  className="input-field"
                />
                <small className="field-help">Optional comma values for variants, e.g. `Red,Blue,Green`.</small>
              </div>

              <div className="form-group">
                <label htmlFor="category">Category *</label>
                <input
                  type="text"
                  id="category"
                  name="category"
                  list="product-form-category-list"
                  value={formData.category}
                  onChange={handleChange}
                  placeholder="e.g., Baby Products -> Haircare"
                  className={`input-field ${errors.category ? 'error' : ''}`}
                />
                <datalist id="product-form-category-list">
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name} />
                  ))}
                </datalist>
                <small className="field-help">Use Parent {'->'} Child for sub-category. Example: Baby Products {'->'} Haircare.</small>
                {errors.category && <span className="field-error">{errors.category}</span>}
              </div>
            </div>
            )}
          </div>

          {!isQuickMode && (
          <div className="form-section">
            <h3 className="section-title">{isQuickMode ? 'Rates & Stock' : 'Pricing'}</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="price">Selling Price (₹) *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  id="price"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  placeholder="0.00"
                  className={`input-field ${errors.price ? 'error' : ''}`}
                />
                {errors.price && <span className="field-error">{errors.price}</span>}
                <small className="field-help">For multiple variants use comma values, e.g. `5,10,50`. Content/Size and Stock auto-fill from this and stay editable.</small>
              </div>

              <div className="form-group">
                <label htmlFor="mrp">MRP (₹)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  id="mrp"
                  name="mrp"
                  value={formData.mrp}
                  onChange={handleChange}
                  placeholder="0.00"
                  className="input-field"
                />
                <small className="field-help">Optional comma values. If blank, each variant uses selling price as MRP.</small>
              </div>
            </div>

            {!isQuickMode && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="defaultDiscount">Discount</label>
                <input
                  type="number"
                  id="defaultDiscount"
                  name="defaultDiscount"
                  value={formData.defaultDiscount}
                  onChange={handleChange}
                  placeholder="0"
                  step="0.01"
                  min="0"
                  className="input-field"
                />
              </div>

              <div className="form-group">
                <label htmlFor="discountType">Discount Type</label>
                <select
                  id="discountType"
                  name="discountType"
                  value={formData.discountType}
                  onChange={handleChange}
                  className="input-field"
                >
                  <option value="fixed">Fixed (₹)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>
            </div>
            )}
          </div>
          )}

          {/* Inventory Section */}
          {!isQuickMode && (
          <div className="form-section">
            <h3 className="section-title">Inventory</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="stock">Stock Quantity *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  id="stock"
                  name="stock"
                  value={formData.stock}
                  onChange={handleChange}
                  placeholder="0"
                  className={`input-field ${errors.stock ? 'error' : ''}`}
                />
                {errors.stock && <span className="field-error">{errors.stock}</span>}
                <small className="field-help">Defaults to `0` per variant (e.g., `0,0,0`) and can be edited.</small>
              </div>

              {isQuickMode ? (
              <div className="form-group">
                <label htmlFor="uom">Unit</label>
                <select
                  id="uom"
                  name="uom"
                  value={formData.uom}
                  onChange={handleChange}
                  className="input-field"
                >
                  {uomOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              ) : (
              <div className="form-group">
                <label htmlFor="base_unit">Base Unit</label>
                <select
                  id="base_unit"
                  name="base_unit"
                  value={formData.base_unit}
                  onChange={handleChange}
                  className="input-field"
                >
                  {uomOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <small className="field-help">Primary unit for inventory</small>
              </div>
              )}
            </div>

            {!isQuickMode && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="uom">Selling UOM</label>
                  <select
                    id="uom"
                    name="uom"
                    value={formData.uom}
                    onChange={handleChange}
                    className="input-field"
                  >
                    {uomOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="expiry_date">Expiry Date</label>
                  <input
                    type="date"
                    id="expiry_date"
                    name="expiry_date"
                    value={formData.expiry_date}
                    onChange={handleChange}
                    className="input-field"
                  />
                </div>
              </div>
            )}

            {visibleAdvancedFields && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="uom_type">UOM Type</label>
                  <select
                    id="uom_type"
                    name="uom_type"
                    value={formData.uom_type}
                    onChange={handleChange}
                    className="input-field"
                  >
                    <option value="selling">Selling Only</option>
                    <option value="purchasing">Purchasing Only</option>
                    <option value="both">Both Selling & Purchasing</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="conversion_factor">Conversion Factor</label>
                  <input
                    type="number"
                    id="conversion_factor"
                    name="conversion_factor"
                    value={formData.conversion_factor}
                    onChange={handleChange}
                    placeholder="1"
                    step="0.0001"
                    min="0"
                    className={`input-field ${errors.conversion_factor ? 'error' : ''}`}
                  />
                  {errors.conversion_factor && <span className="field-error">{errors.conversion_factor}</span>}
                  <small className="field-help">Selling units per base unit (e.g., 1000 when selling g and base is kg)</small>
                </div>
              </div>
            )}
          </div>
          )}

          {visibleAdvancedFields && (
            <div className="form-section">
              <h3 className="section-title">SKU & Barcode</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="sku">
                    <Package size={16} /> SKU (Auto-generated)
                  </label>
                  <input
                    type="text"
                    id="sku"
                    name="sku"
                    value={formData.sku}
                    onChange={handleChange}
                  placeholder="Auto-generated SKU"
                  className="input-field"
                  readOnly={!isEditing}
                />
                  <small className="field-help">Format: Name[:4] + Brand[:4] + Content[:2] + Price[:4]. For multi-variant, comma SKUs are supported.</small>
                </div>

                <div className="form-group">
                  <label htmlFor="barcode">
                    <QrCode size={16} /> Barcode
                  </label>
                  <input
                    type="text"
                    id="barcode"
                    name="barcode"
                    value={formData.barcode}
                    onChange={handleChange}
                    placeholder="Enter barcode (numeric)"
                    className="input-field"
                  />
                </div>
              </div>
            </div>
          )}

          {!isQuickMode && (
          <div className="form-section">
            <h3 className="section-title">Product Image</h3>
            
            <div className="form-group">
              <label htmlFor="image">Image URL</label>
              <ImageUrlPicker
                value={formData.image}
                disabled={loading}
                productMeta={{
                  name: formData.name,
                  brand: formData.brand,
                  content: formData.content,
                  category: formData.category,
                }}
                onChange={(nextUrl) => {
                  setFormData((prev) => ({ ...prev, image: nextUrl }));
                }}
              />
            </div>

            {formData.image && (
              <div className="image-preview">
                <img src={getProductImageSrc(formData.image)} alt="Product preview" onError={(e) => e.target.style.display = 'none'} />
              </div>
            )}

          </div>
          )}

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Saving...' : (isEditing ? 'Update Product' : (isQuickMode ? 'Add Now' : `Add Product${batchProducts.length ? ` (${batchProducts.length} queued)` : ''}`))}
            </button>
          </div>
      </form>
    </>
  );

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        title={formHeading}
        onClose={onClose}
        className={`product-form-sheet${isQuickMode ? ' product-form-sheet-compact' : ''}`}
      >
        {formContent}
      </MobileBottomSheet>
    );
  }

  return (
    <div className="product-form-overlay">
      <div className={`product-form-container fade-in-up${isQuickMode ? ' compact' : ''}`}>
        <div className="product-form-header">
          <h2>{formHeading}</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
        {formContent}
      </div>
    </div>
  );
}

export default ProductForm;
