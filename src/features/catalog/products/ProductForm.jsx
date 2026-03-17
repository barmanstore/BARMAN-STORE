import { useState, useEffect } from 'react';
import { productsApi, categoriesApi } from '../../../services/api';
import useIsMobile from '../../../hooks/useIsMobile';
import useLockBodyScroll from '../../../hooks/useLockBodyScroll';
import {
  splitCommaValues,
  joinCommaValues,
  getPricingVariantCount,
  pickVariantValueLoose,
  createInitialFormData,
  generateAutoSKU,
  generateDescriptionSuggestion,
  prepareFormDataForSubmit,
} from './utils/productFormHelpers';
import { validateProductFormData } from './utils/productFormValidation';
import ProductFormView from './components/form/ProductFormView';
import './ProductForm.css';

function ProductForm({ product, onClose, onSave, mode = 'full' }) {
  const isQuickMode = mode === 'quick';
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
  useLockBodyScroll(!isMobile);
  const [showAdvancedFields, setShowAdvancedFields] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth > 768;
  });

  useEffect(() => {
    fetchCategories();
    if (product) {
      setFormData({
        name: product.name || '',
        description: product.description || '',
        brand: product.brand_path || product.brand || '',
        content: product.content || '',
        purchase_pack_size: product.purchase_pack_size?.toString() || '',
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

  const handleSuggestDescription = () => {
    const suggested = generateDescriptionSuggestion(formData);
    if (!suggested) return;
    setFormData(prev => ({ ...prev, description: suggested }));
    setIsDescriptionAuto(true);
  };

  const validateFormData = (data) => validateProductFormData(data);

  const buildProductData = (data) => ({
    name: data.name.trim(),
    description: data.description.trim(),
    brand: data.brand.trim(),
    content: data.content.trim(),
    purchase_pack_size: String(data.purchase_pack_size || '').trim() === '' ? null : parseFloat(data.purchase_pack_size),
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
      purchase_pack_size: splitCommaValues(data.purchase_pack_size),
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
      lists.purchase_pack_size.length,
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
        purchase_pack_size: pickValue('purchase_pack_size', i),
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
    return ['name', 'description', 'brand', 'content', 'purchase_pack_size', 'color', 'price', 'mrp', 'barcode', 'sku', 'image', 'stock', 'expiry_date', 'category', 'defaultDiscount']
      .some((field) => String(data[field] || '').trim() !== '');
  };

  const handleAddToBatch = () => {
    setError('');
    let variantRows = [];
    try {
      variantRows = buildVariantFormRows(prepareFormDataForSubmit(formData, { isQuickMode }));
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

    if (['name', 'brand', 'content', 'purchase_pack_size', 'price', 'mrp'].includes(name)) {
      const contentValues = splitCommaValues(nextFormData.content);
      const packValues = splitCommaValues(nextFormData.purchase_pack_size);
      const priceValues = splitCommaValues(nextFormData.price);
      const mrpValues = splitCommaValues(nextFormData.mrp);
      const skuVariantCount = Math.max(1, contentValues.length, packValues.length, priceValues.length, mrpValues.length);
      const skuList = [];
      for (let i = 0; i < skuVariantCount; i += 1) {
        const row = {
          ...nextFormData,
          content: pickVariantValueLoose(contentValues, i, skuVariantCount)
            || pickVariantValueLoose(priceValues, i, skuVariantCount)
            || pickVariantValueLoose(mrpValues, i, skuVariantCount),
          purchase_pack_size: pickVariantValueLoose(packValues, i, skuVariantCount),
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
          variantRows = buildVariantFormRows(prepareFormDataForSubmit(formData, { isQuickMode }));
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

        if (variantRows.length === 1 && product.latest_cost != null) {
          const latestCost = Number(product.latest_cost || 0);
          if (latestCost > 0) {
            const selling = Number(variantRows[0].price || variantRows[0].mrp || 0);
            if (selling > 0 && selling < latestCost) {
              const ok = window.confirm(
                `Warning: Selling price (Rs ${selling.toFixed(2)}) is below latest purchase cost (Rs ${latestCost.toFixed(2)}).\n\n` +
                'Do you still want to save this product price?'
              );
              if (!ok) {
                setLoading(false);
                return;
              }
            }
          }
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
            variantRows = buildVariantFormRows(prepareFormDataForSubmit(formData, { isQuickMode }));
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

  const handleImageChange = (nextUrl) => {
    setFormData((prev) => ({ ...prev, image: nextUrl }));
  };

  return (
    <ProductFormView
      isMobile={isMobile}
      formHeading={formHeading}
      isQuickMode={isQuickMode}
      isEditing={isEditing}
      error={error}
      formData={formData}
      errors={errors}
      categories={categories}
      loading={loading}
      showAdvancedFields={showAdvancedFields}
      setShowAdvancedFields={setShowAdvancedFields}
      visibleAdvancedFields={visibleAdvancedFields}
      batchProducts={batchProducts}
      onClose={onClose}
      onSubmit={handleSubmit}
      onChange={handleChange}
      onSuggestDescription={handleSuggestDescription}
      onAddToBatch={handleAddToBatch}
      onClearBatch={handleClearBatch}
      onRemoveBatchItem={handleRemoveBatchItem}
      onImageChange={handleImageChange}
    />
  );
}

export default ProductForm;
