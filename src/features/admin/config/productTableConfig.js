export const PRODUCT_TABLE_COLUMN_OPTIONS = [
  { key: 'name', label: 'Name' },
  { key: 'brand', label: 'Brand' },
  { key: 'category', label: 'Category' },
  { key: 'price', label: 'Price' },
  { key: 'mrp', label: 'MRP' },
  { key: 'stock', label: 'Stock' },
  { key: 'sku', label: 'SKU' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'status', label: 'Status' },
  { key: 'description', label: 'Description' },
  { key: 'content', label: 'Content' },
  { key: 'purchase_pack_size', label: 'Pack Size' },
  { key: 'color', label: 'Color' },
  { key: 'uom', label: 'UOM' },
  { key: 'expiry', label: 'Expiry' },
  { key: 'discount', label: 'Discount' },
  { key: 'discountType', label: 'Disc Type' },
  { key: 'id', label: 'ID' },
  { key: 'created', label: 'Created' },
  { key: 'src', label: 'Src' },
];

export const PRODUCT_TABLE_ALL_COLUMN_KEYS = PRODUCT_TABLE_COLUMN_OPTIONS.map(
  (column) => column.key
);

export const PRODUCT_TABLE_DEFAULT_VISIBLE_COLUMNS = [
  'name',
  'brand',
  'category',
  'price',
  'stock',
  'status',
];

export const PRODUCT_TABLE_COLUMN_MIN_WIDTH = {
  name: 130,
  brand: 95,
  category: 95,
  price: 78,
  mrp: 78,
  stock: 60,
  sku: 90,
  barcode: 90,
  status: 70,
  description: 150,
  content: 80,
  purchase_pack_size: 90,
  color: 70,
  uom: 55,
  expiry: 90,
  discount: 60,
  discountType: 65,
  id: 50,
  created: 85,
  src: 120,
};
