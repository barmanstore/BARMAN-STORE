import pg from 'pg';
import { createRequire } from 'node:module';
import '../server/loadEnv.js';

const require = createRequire(import.meta.url);
const { buildPostgresConfigFromEnv } = require('../server/db/postgresScaffold');

const { Pool } = pg;

const normalizeSkuToken = (value) => String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
const toSkuFixed = (value, length, fallback = 'X') => {
  const clean = normalizeSkuToken(value);
  if (!clean) return fallback.repeat(length);
  return clean.slice(0, length);
};
const normalizeSkuContent = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return 'NA';
  return raw.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'NA';
};
const normalizeSkuPrice = (price, mrp) => {
  const candidate = price ?? mrp ?? '';
  const raw = String(candidate || '').replace(/,/g, '');
  const integerPart = raw.split('.')[0] || '';
  const digits = integerPart.replace(/[^0-9]/g, '');
  return digits || '0';
};
const normalizeSkuPackSize = (value) => {
  const raw = String(value ?? '').replace(/,/g, '');
  const integerPart = raw.split('.')[0] || '';
  const digits = integerPart.replace(/[^0-9]/g, '');
  return digits || '0';
};
const generateSku = ({ name, brand, content, price, mrp, purchase_pack_size }) => {
  const nameCode = toSkuFixed(name, 4, 'N');
  const brandCode = toSkuFixed(brand, 3, 'B');
  const contentCode = normalizeSkuContent(content);
  const priceCode = normalizeSkuPrice(price, mrp);
  const packCode = normalizeSkuPackSize(purchase_pack_size);
  return `${nameCode}-${brandCode}-${contentCode}-${priceCode}-P${packCode}`;
};

const main = async () => {
  const pool = new Pool(buildPostgresConfigFromEnv());
  try {
    const { rows } = await pool.query(
      `SELECT id, name, brand, sub_brand, content, price, mrp, purchase_pack_size, color, category, subcategory, uom, sku
       FROM products
       ORDER BY id ASC`
    );

    const prepared = rows.map((row) => {
      const brand = row.sub_brand || row.brand || '';
      const baseSku = generateSku({
        name: row.name,
        brand,
        content: row.content,
        price: row.price,
        mrp: row.mrp,
        purchase_pack_size: row.purchase_pack_size,
      });
      return { ...row, baseSku };
    });

    const counts = new Map();
    for (const row of prepared) {
      counts.set(row.baseSku, (counts.get(row.baseSku) || 0) + 1);
    }
    const sequence = new Map();

    let updates = 0;
    let collisions = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of prepared) {
        const totalForBase = counts.get(row.baseSku) || 0;
        let nextSku = row.baseSku;
        if (totalForBase > 1) {
          collisions += 1;
          const next = (sequence.get(row.baseSku) || 0) + 1;
          sequence.set(row.baseSku, next);
          nextSku = `${row.baseSku}-${String(next).padStart(2, '0')}`;
        }
        if (String(row.sku || '').trim() !== nextSku) {
          await client.query(`UPDATE products SET sku = $1 WHERE id = $2`, [nextSku, row.id]);
          updates += 1;
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    console.log(`[SKU] Updated ${updates} products. Collisions resolved: ${collisions}.`);
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(`[SKU] Failed to update SKUs: ${error.message}`);
  process.exit(1);
});
