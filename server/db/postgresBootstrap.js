const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const canonicalizeSql = (content) => String(content || '')
  .replace(/^\uFEFF/, '')
  .replace(/\r\n/g, '\n');

const ensureMigrationTable = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const listMigrationFiles = (migrationsDir) => {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs.readdirSync(migrationsDir)
    .filter((name) => name.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};

const checksum = (content) => crypto.createHash('sha256').update(content).digest('hex');

const applyPostgresMigrations = async (pool, migrationsDir) => {
  await ensureMigrationTable(pool);
  const files = listMigrationFiles(migrationsDir);
  const applied = [];
  const skipped = [];

  for (const fileName of files) {
    const filePath = path.join(migrationsDir, fileName);
    const sqlRaw = fs.readFileSync(filePath, 'utf8');
    const sql = canonicalizeSql(sqlRaw);
    const sqlChecksum = checksum(sql);
    const legacyChecksum = checksum(sqlRaw);
    const existing = await pool.query(
      `SELECT id, checksum FROM app_schema_migrations WHERE name = $1 LIMIT 1`,
      [fileName]
    );
    if (existing.rows[0]) {
      const existingChecksum = String(existing.rows[0].checksum || '');
      const matchesCanonical = existingChecksum === sqlChecksum;
      const matchesLegacy = existingChecksum === legacyChecksum;
      if (!matchesCanonical && !matchesLegacy) {
        throw new Error(
          `Migration checksum mismatch for ${fileName}. Refuse to continue. `
          + `stored=${existingChecksum} expected=${sqlChecksum}`
        );
      }
      if (!matchesCanonical && matchesLegacy) {
        await pool.query(
          `UPDATE app_schema_migrations SET checksum = $1 WHERE id = $2`,
          [sqlChecksum, existing.rows[0].id]
        );
      }
      skipped.push(fileName);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO app_schema_migrations (name, checksum) VALUES ($1, $2)`,
        [fileName, sqlChecksum]
      );
      await client.query('COMMIT');
      applied.push(fileName);
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        // ignore rollback failures
      }
      throw new Error(`Failed applying migration ${fileName}: ${error.message}`);
    } finally {
      client.release();
    }
  }

  return { applied, skipped, total: files.length };
};

const ensurePostgresBootstrapData = async ({
  pool,
  normalizeEmail,
  isStrongPassword,
  hashPassword,
  generateSku,
}) => {
  await pool.query(
    `UPDATE products
     SET subcategory = BTRIM(SUBSTRING(category FROM POSITION('->' IN category) + 2)),
         category = BTRIM(SUBSTRING(category FROM 1 FOR POSITION('->' IN category) - 1))
     WHERE category IS NOT NULL
       AND POSITION('->' IN category) > 0
       AND (subcategory IS NULL OR BTRIM(subcategory) = '')
       AND BTRIM(SUBSTRING(category FROM 1 FOR POSITION('->' IN category) - 1)) <> ''
       AND BTRIM(SUBSTRING(category FROM POSITION('->' IN category) + 2)) <> ''`
  );

  await pool.query(
    `UPDATE products
     SET sub_brand = BTRIM(SUBSTRING(brand FROM POSITION('->' IN brand) + 2)),
         brand = BTRIM(SUBSTRING(brand FROM 1 FOR POSITION('->' IN brand) - 1))
     WHERE brand IS NOT NULL
       AND POSITION('->' IN brand) > 0
       AND (sub_brand IS NULL OR BTRIM(sub_brand) = '')
       AND BTRIM(SUBSTRING(brand FROM 1 FOR POSITION('->' IN brand) - 1)) <> ''
       AND BTRIM(SUBSTRING(brand FROM POSITION('->' IN brand) + 2)) <> ''`
  );

  const adminRows = await pool.query(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`);
  const adminCount = Number(adminRows.rows?.[0]?.count || 0);
  if (adminCount === 0) {
    const bootstrapAdminEmail = normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL);
    const bootstrapAdminPassword = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
    const fallbackPassword = (() => {
      if (isStrongPassword(bootstrapAdminPassword)) return bootstrapAdminPassword;
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
      let candidate = '';
      while (!isStrongPassword(candidate)) {
        candidate = '';
        for (let i = 0; i < 14; i += 1) {
          candidate += chars[Math.floor(Math.random() * chars.length)];
        }
      }
      return candidate;
    })();
    if (bootstrapAdminEmail) {
      await pool.query(
        `INSERT INTO users (role, name, email, email_verified, phone, address, password_hash, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['admin', 'Administrator', bootstrapAdminEmail, 1, null, null, hashPassword(fallbackPassword), 0]
      );
      console.warn('Bootstrap admin account created (OTP/OAuth login only; password auth is disabled).');
    } else {
      console.warn('No admin user exists. Set BOOTSTRAP_ADMIN_EMAIL to create the initial admin account.');
    }
  }

  const productRows = await pool.query(`SELECT COUNT(*) AS count FROM products`);
  const productCount = Number(productRows.rows?.[0]?.count || 0);
  if (productCount === 0) {
    const products = [
      ['Premium Coffee Beans', 'Artisan roasted coffee beans from Colombia', 'CoffeeCo', '250g', 'Brown', 24.99, 29.99, 'pcs', 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=500', 50, 'Groceries'],
      ['Barista Apron', 'Premium cotton barista apron', 'BarWear', 'L', 'Black', 34.99, 39.99, 'pcs', 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=500', 30, 'Stationery'],
      ['Corn Flakes', 'Crunchy breakfast cereal', 'CerealPro', '500g', 'Yellow', 119.0, 129.0, 'box', 'https://images.unsplash.com/photo-1571748982800-fa51082c2224?w=500', 100, 'Cereals'],
      ['Digestive Biscuits', 'Whole wheat digestive biscuits', 'WheatB', '250g', 'Brown', 49.0, 55.0, 'pack', 'https://images.unsplash.com/photo-1612203985729-70726954388c?w=500', 150, 'Biscuits'],
    ];

    for (const p of products) {
      const sku = generateSku(p[0], p[2], p[3], p[6]);
      await pool.query(
        `INSERT INTO products
         (name, description, brand, content, color, price, mrp, uom, sku, image, stock, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], sku, p[8], p[9], p[10]]
      );
    }
  }

  const categoryRows = await pool.query(
    `SELECT DISTINCT category
     FROM products
     WHERE category IS NOT NULL AND BTRIM(category) <> ''`
  );
  for (const row of categoryRows.rows || []) {
    const category = String(row.category || '').trim();
    if (!category) continue;
    await pool.query(
      `INSERT INTO categories (name, description, parent_id)
       VALUES ($1, $2, NULL)
       ON CONFLICT DO NOTHING`,
      [category, `${category} products`]
    );
  }
};

module.exports = {
  applyPostgresMigrations,
  ensurePostgresBootstrapData,
};
