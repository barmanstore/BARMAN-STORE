const XLSX = require('xlsx');
const headers = [
  'name',
  'description',
  'category',
  'subcategory',
  'brand',
  'sub_brand',
  'content',
  'color',
  'price',
  'mrp',
  'stock',
  'sku',
  'barcode',
  'image',
  'uom',
  'base_unit',
  'uom_type',
  'conversion_factor',
  'purchase_pack_size',
  'expiry_date',
  'default_discount',
  'discount_type',
  'is_active'
];
const sampleRow = {
  name: 'Sample Product',
  description: 'Example item from import template',
  category: 'Groceries',
  subcategory: 'Snacks',
  brand: 'BrandX',
  sub_brand: 'Standard',
  content: 'Pack of 10',
  color: 'Red',
  price: 99.0,
  mrp: 120.0,
  stock: 50,
  sku: 'BRX-SN-001',
  barcode: '8901234567890',
  image: 'https://example.com/image.jpg',
  uom: 'pcs',
  base_unit: 'pcs',
  uom_type: 'selling',
  conversion_factor: 1,
  purchase_pack_size: 1,
  expiry_date: '',
  default_discount: 0,
  discount_type: 'fixed',
  is_active: 1,
};
const data = [headers, Object.values(sampleRow)];
const worksheet = XLSX.utils.aoa_to_sheet(data);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
XLSX.writeFile(workbook, 'product-import-template.xlsx');
console.log('product-import-template.xlsx created');
