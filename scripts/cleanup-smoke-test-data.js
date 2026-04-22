require('../server/loadEnv');
const {
  createPostgresPool,
  getPostgresConnectionLabel,
  pingPostgresPool,
} = require('../server/db/postgresScaffold');

const explicitSmokeDbUrl = String(
  process.env.SMOKE_TEST_DB_URL || process.env.PHONE_TEST_DB_URL || ''
).trim();
if (explicitSmokeDbUrl) {
  process.env.SUPABASE_DB_URL = explicitSmokeDbUrl;
  process.env.DATABASE_URL = explicitSmokeDbUrl;
}

const SMOKE_EMAIL_REGEX =
  '^(admin|customer|phone|po-admin)-smoke-[^@]*@example\\.com$|^category-admin-[^@]*@example\\.com$';
const SMOKE_MESSAGE_REGEX =
  '(phone-smoke-|customer-smoke-|admin-smoke-|po-admin-smoke-|category-admin-|Smoke Customer|Smoke Product|Smoke PO Product|Smoke Distributor|Category Tree Product|Category tree smoke|Category Smoke Admin|SMOKE-PART-|SMOKE-FINAL-|Smoke lifecycle|SMK-)';

const toNumberArray = (rows, key = 'id') =>
  Array.isArray(rows)
    ? rows
        .map((row) => Number(row?.[key] || 0))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];

const toTextArray = (rows, key = 'bill_number') =>
  Array.isArray(rows) ? rows.map((row) => String(row?.[key] || '').trim()).filter(Boolean) : [];

const uniqueNumbers = (values) => [
  ...new Set((values || []).filter((v) => Number.isFinite(v) && v > 0)),
];
const uniqueTexts = (values) => [
  ...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean)),
];

const run = async () => {
  const apply = process.argv.includes('--apply');
  const failOnMatches = process.argv.includes('--fail-on-matches');
  const dryRun = !apply;
  const pool = createPostgresPool();

  const tableExists = async (tableName) => {
    const result = await pool.query('SELECT to_regclass($1) AS table_ref', [`public.${tableName}`]);
    return Boolean(result?.rows?.[0]?.table_ref);
  };

  const queryIfTable = async (tableName, sql, params = []) => {
    if (!(await tableExists(tableName))) return [];
    const result = await pool.query(sql, params);
    return result.rows || [];
  };

  const summarizeAndDelete = async (tableName, whereClause, params = []) => {
    if (!(await tableExists(tableName))) {
      return { tableName, exists: false, matched: 0, deleted: 0 };
    }
    const countSql = `SELECT COUNT(*)::bigint AS count FROM ${tableName} WHERE ${whereClause}`;
    const countResult = await pool.query(countSql, params);
    const matched = Number(countResult?.rows?.[0]?.count || 0);
    if (!apply || matched <= 0) {
      return { tableName, exists: true, matched, deleted: 0 };
    }
    const deleteSql = `DELETE FROM ${tableName} WHERE ${whereClause}`;
    const deleteResult = await pool.query(deleteSql, params);
    return { tableName, exists: true, matched, deleted: Number(deleteResult?.rowCount || 0) };
  };

  const summarizeAndDeleteCategoriesLeafFirst = async (whereClause, params = []) => {
    const tableName = 'categories';
    if (!(await tableExists(tableName))) {
      return { tableName, exists: false, matched: 0, deleted: 0 };
    }
    const countSql = `SELECT COUNT(*)::bigint AS count FROM ${tableName} WHERE ${whereClause}`;
    const countResult = await pool.query(countSql, params);
    const matched = Number(countResult?.rows?.[0]?.count || 0);
    if (!apply || matched <= 0) {
      return { tableName, exists: true, matched, deleted: 0 };
    }

    let deleted = 0;
    // Delete leaf categories first so parent deletion does not trigger parent_id->NULL collisions.
    for (let pass = 0; pass < 200; pass += 1) {
      const deleteLeavesSql = `
        DELETE FROM categories
        WHERE id IN (
          SELECT c.id
          FROM categories c
          WHERE ${whereClause}
            AND NOT EXISTS (
              SELECT 1
              FROM categories child
              WHERE child.parent_id = c.id
            )
          LIMIT 500
        )`;
      const deleteResult = await pool.query(deleteLeavesSql, params);
      const chunk = Number(deleteResult?.rowCount || 0);
      if (chunk <= 0) break;
      deleted += chunk;
    }
    return { tableName, exists: true, matched, deleted };
  };

  try {
    await pingPostgresPool(pool);
    console.log(`[SMOKE-CLEANUP] Connected: ${getPostgresConnectionLabel()}`);
    console.log(`[SMOKE-CLEANUP] Mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`);

    await pool.query('BEGIN');

    const smokeUsers = await queryIfTable(
      'users',
      `SELECT id, email
       FROM users
       WHERE COALESCE(email, '') ~* $1
          OR COALESCE(name, '') ~* '^Smoke (Admin|Customer)'
          OR COALESCE(name, '') ~* '^Category Smoke Admin'
          OR (password_hash = 'smoke-hash' AND COALESCE(email, '') ILIKE '%@example.com')`,
      [SMOKE_EMAIL_REGEX]
    );
    const smokeUserIds = uniqueNumbers(toNumberArray(smokeUsers));

    const smokeProducts = await queryIfTable(
      'products',
      `SELECT id, sku, name
       FROM products
       WHERE COALESCE(sku, '') LIKE 'SMK-%'
           OR COALESCE(name, '') ILIKE 'Smoke Product%'
           OR COALESCE(name, '') ILIKE 'Smoke PO Product%'
           OR COALESCE(name, '') ILIKE 'Category Tree Product%'
           OR COALESCE(description, '') ILIKE '%category tree smoke%'`
    );
    const smokeProductIds = uniqueNumbers(toNumberArray(smokeProducts));

    const smokeCategories = await queryIfTable(
      'categories',
      `WITH RECURSIVE smoke_seed AS (
         SELECT id, parent_id, name
         FROM categories
         WHERE COALESCE(name, '') ILIKE 'CAT_PARENT_A_%'
            OR COALESCE(name, '') ILIKE 'CAT_PARENT_B_%'
            OR COALESCE(name, '') ILIKE 'CAT_ROOT_%'
            OR COALESCE(name, '') ILIKE 'CAT_MID_%'
            OR COALESCE(name, '') ILIKE 'CAT_LEAF_%'
            OR COALESCE(name, '') ILIKE 'Category Smoke %'
            OR COALESCE(description, '') ILIKE '%category tree smoke%'
       ),
       smoke_tree AS (
         SELECT id, parent_id, name
         FROM smoke_seed
         UNION
         SELECT child.id, child.parent_id, child.name
         FROM categories child
         INNER JOIN smoke_tree tree ON child.parent_id = tree.id
       )
       SELECT DISTINCT id, name
       FROM smoke_tree`
    );
    const smokeCategoryIds = uniqueNumbers(toNumberArray(smokeCategories));

    const smokeDistributors = await queryIfTable(
      'distributors',
      `SELECT id, name
       FROM distributors
       WHERE COALESCE(name, '') ILIKE 'Smoke Distributor%'
          OR COALESCE(contacts, '') ~* $1`,
      [SMOKE_MESSAGE_REGEX]
    );
    const smokeDistributorIds = uniqueNumbers(toNumberArray(smokeDistributors));

    const smokeOrders = await queryIfTable(
      'orders',
      `SELECT id, order_number
       FROM orders
       WHERE (cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[]))
          OR COALESCE(customer_email, '') ~* $2
          OR COALESCE(customer_name, '') ILIKE 'Smoke Customer%'
          OR COALESCE(customer_name, '') ILIKE 'Smoke Admin%'`,
      [smokeUserIds, SMOKE_EMAIL_REGEX]
    );
    const smokeOrderIds = uniqueNumbers(toNumberArray(smokeOrders));

    const smokeBills = await queryIfTable(
      'bills',
      `SELECT id, bill_number
       FROM bills
       WHERE (cardinality($1::bigint[]) > 0 AND order_id = ANY($1::bigint[]))
          OR (cardinality($2::bigint[]) > 0 AND customer_id = ANY($2::bigint[]))
          OR COALESCE(customer_email, '') ~* $3
          OR COALESCE(customer_name, '') ILIKE 'Smoke Customer%'`,
      [smokeOrderIds, smokeUserIds, SMOKE_EMAIL_REGEX]
    );
    const smokeBillIds = uniqueNumbers(toNumberArray(smokeBills));
    const smokeBillNumbers = uniqueTexts(toTextArray(smokeBills));

    const smokeCredits = await queryIfTable(
      'credit_history',
      `SELECT id
       FROM credit_history
       WHERE (cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[]))
          OR (cardinality($1::bigint[]) > 0 AND created_by = ANY($1::bigint[]))
          OR (cardinality($2::text[]) > 0 AND COALESCE(reference, '') = ANY($2::text[]))`,
      [smokeUserIds, smokeBillNumbers]
    );
    const smokeCreditIds = uniqueNumbers(toNumberArray(smokeCredits));

    const smokeIssues = await queryIfTable(
      'credit_entry_issues',
      `SELECT id
       FROM credit_entry_issues
       WHERE (cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[]))
          OR (cardinality($1::bigint[]) > 0 AND reported_by = ANY($1::bigint[]))
          OR (cardinality($1::bigint[]) > 0 AND resolved_by = ANY($1::bigint[]))
          OR (cardinality($2::bigint[]) > 0 AND credit_entry_id = ANY($2::bigint[]))
          OR (cardinality($2::bigint[]) > 0 AND correction_entry_id = ANY($2::bigint[]))`,
      [smokeUserIds, smokeCreditIds]
    );
    const smokeIssueIds = uniqueNumbers(toNumberArray(smokeIssues));

    const smokePurchaseOrders = await queryIfTable(
      'purchase_orders',
      `SELECT id, po_number
       FROM purchase_orders
       WHERE (cardinality($1::bigint[]) > 0 AND distributor_id = ANY($1::bigint[]))
          OR COALESCE(notes, '') ~* $2
          OR COALESCE(po_number, '') ~* $2
          OR COALESCE(bill_number, '') ~* $2
          OR COALESCE(invoice_number, '') ~* $2`,
      [smokeDistributorIds, SMOKE_MESSAGE_REGEX]
    );
    const smokePurchaseOrderIds = uniqueNumbers(toNumberArray(smokePurchaseOrders));

    const smokePurchaseOrderPayments = await queryIfTable(
      'purchase_order_payments',
      `SELECT id
       FROM purchase_order_payments
       WHERE (cardinality($1::bigint[]) > 0 AND purchase_order_id = ANY($1::bigint[]))
          OR (cardinality($2::bigint[]) > 0 AND distributor_id = ANY($2::bigint[]))
          OR COALESCE(reference, '') ~* $3
          OR COALESCE(notes, '') ~* $3`,
      [smokePurchaseOrderIds, smokeDistributorIds, SMOKE_MESSAGE_REGEX]
    );
    const smokePurchaseOrderPaymentIds = uniqueNumbers(toNumberArray(smokePurchaseOrderPayments));

    const operations = [
      {
        tableName: 'bill_items',
        whereClause: '(cardinality($1::bigint[]) > 0 AND bill_id = ANY($1::bigint[]))',
        params: [smokeBillIds],
      },
      {
        tableName: 'order_items',
        whereClause:
          '(cardinality($1::bigint[]) > 0 AND order_id = ANY($1::bigint[])) OR (cardinality($2::bigint[]) > 0 AND product_id = ANY($2::bigint[]))',
        params: [smokeOrderIds, smokeProductIds],
      },
      {
        tableName: 'order_status_history',
        whereClause:
          '(cardinality($1::bigint[]) > 0 AND order_id = ANY($1::bigint[])) OR (cardinality($2::bigint[]) > 0 AND created_by = ANY($2::bigint[]))',
        params: [smokeOrderIds, smokeUserIds],
      },
      {
        tableName: 'credit_entry_issues',
        whereClause:
          '(cardinality($1::bigint[]) > 0 AND id = ANY($1::bigint[])) OR (cardinality($2::bigint[]) > 0 AND user_id = ANY($2::bigint[])) OR (cardinality($2::bigint[]) > 0 AND reported_by = ANY($2::bigint[])) OR (cardinality($2::bigint[]) > 0 AND resolved_by = ANY($2::bigint[]))',
        params: [smokeIssueIds, smokeUserIds],
      },
      {
        tableName: 'app_notifications',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[])) OR (cardinality($1::bigint[]) > 0 AND created_by = ANY($1::bigint[])) OR (cardinality($2::bigint[]) > 0 AND issue_id = ANY($2::bigint[])) OR COALESCE(title, '') ~* $3 OR COALESCE(message, '') ~* $3 OR COALESCE(metadata, '') ~* $3",
        params: [smokeUserIds, smokeIssueIds, SMOKE_MESSAGE_REGEX],
      },
      {
        tableName: 'phone_change_requests',
        whereClause:
          '(cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[])) OR (cardinality($1::bigint[]) > 0 AND requested_by = ANY($1::bigint[])) OR (cardinality($1::bigint[]) > 0 AND reviewed_by = ANY($1::bigint[])) OR (cardinality($1::bigint[]) > 0 AND conflict_user_id = ANY($1::bigint[]))',
        params: [smokeUserIds],
      },
      {
        tableName: 'auth_login_otps',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[])) OR COALESCE(email, '') ~* $2",
        params: [smokeUserIds, SMOKE_EMAIL_REGEX],
      },
      {
        tableName: 'email_verification_tokens',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[])) OR COALESCE(email, '') ~* $2",
        params: [smokeUserIds, SMOKE_EMAIL_REGEX],
      },
      {
        tableName: 'phone_verification_tokens',
        whereClause: '(cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[]))',
        params: [smokeUserIds],
      },
      {
        tableName: 'contact_verification_requests',
        whereClause:
          '(cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[])) OR (cardinality($1::bigint[]) > 0 AND requested_by = ANY($1::bigint[])) OR (cardinality($1::bigint[]) > 0 AND processed_by = ANY($1::bigint[]))',
        params: [smokeUserIds],
      },
      {
        tableName: 'password_reset_requests',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[])) OR COALESCE(email, '') ~* $2",
        params: [smokeUserIds, SMOKE_EMAIL_REGEX],
      },
      {
        tableName: 'password_reset_otps',
        whereClause: '(cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[]))',
        params: [smokeUserIds],
      },
      {
        tableName: 'password_reset_sessions',
        whereClause: '(cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[]))',
        params: [smokeUserIds],
      },
      {
        tableName: 'notification_events',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND recipient_user_id = ANY($1::bigint[])) OR (cardinality($1::bigint[]) > 0 AND prepared_by = ANY($1::bigint[])) OR (cardinality($1::bigint[]) > 0 AND sent_by = ANY($1::bigint[])) OR COALESCE(recipient, '') ~* $2 OR COALESCE(subject, '') ~* $3 OR COALESCE(body, '') ~* $3 OR COALESCE(metadata, '') ~* $3",
        params: [smokeUserIds, SMOKE_EMAIL_REGEX, SMOKE_MESSAGE_REGEX],
      },
      {
        tableName: 'notification_send_batches',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND sender_user_id = ANY($1::bigint[])) OR COALESCE(message, '') ~* $2 OR COALESCE(recipient_names, '') ~* $2",
        params: [smokeUserIds, SMOKE_MESSAGE_REGEX],
      },
      {
        tableName: 'messages',
        whereClause:
          '(cardinality($1::bigint[]) > 0 AND sender_id = ANY($1::bigint[])) OR (cardinality($1::bigint[]) > 0 AND recipient_id = ANY($1::bigint[]))',
        params: [smokeUserIds],
      },
      {
        tableName: 'visitor_sessions',
        whereClause: '(cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[]))',
        params: [smokeUserIds],
      },
      {
        tableName: 'credit_history',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[])) OR (cardinality($1::bigint[]) > 0 AND created_by = ANY($1::bigint[])) OR (cardinality($2::text[]) > 0 AND COALESCE(reference, '') = ANY($2::text[])) OR COALESCE(client_request_id, '') ~* $3",
        params: [smokeUserIds, smokeBillNumbers, SMOKE_MESSAGE_REGEX],
      },
      {
        tableName: 'stock_ledger',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND product_id = ANY($1::bigint[])) OR (cardinality($2::bigint[]) > 0 AND user_id = ANY($2::bigint[])) OR COALESCE(sku, '') LIKE 'SMK-%' OR COALESCE(product_name, '') ILIKE 'Smoke Product%' OR COALESCE(product_name, '') ILIKE 'Category Tree Product%'",
        params: [smokeProductIds, smokeUserIds],
      },
      {
        tableName: 'bills',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND id = ANY($1::bigint[])) OR (cardinality($2::bigint[]) > 0 AND customer_id = ANY($2::bigint[])) OR COALESCE(customer_email, '') ~* $3 OR COALESCE(customer_name, '') ILIKE 'Smoke Customer%' OR COALESCE(client_request_id, '') ~* $4",
        params: [smokeBillIds, smokeUserIds, SMOKE_EMAIL_REGEX, SMOKE_MESSAGE_REGEX],
      },
      {
        tableName: 'orders',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND id = ANY($1::bigint[])) OR (cardinality($2::bigint[]) > 0 AND user_id = ANY($2::bigint[])) OR COALESCE(customer_email, '') ~* $3 OR COALESCE(customer_name, '') ILIKE 'Smoke Customer%'",
        params: [smokeOrderIds, smokeUserIds, SMOKE_EMAIL_REGEX],
      },
      {
        tableName: 'batch_stock',
        whereClause: '(cardinality($1::bigint[]) > 0 AND product_id = ANY($1::bigint[]))',
        params: [smokeProductIds],
      },
      {
        tableName: 'purchase_order_items',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND order_id = ANY($1::bigint[])) OR (cardinality($2::bigint[]) > 0 AND product_id = ANY($2::bigint[])) OR COALESCE(product_name, '') ILIKE 'Smoke Product%' OR COALESCE(product_name, '') ILIKE 'Smoke PO Product%'",
        params: [smokePurchaseOrderIds, smokeProductIds],
      },
      {
        tableName: 'purchase_order_payments',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND id = ANY($1::bigint[])) OR (cardinality($2::bigint[]) > 0 AND purchase_order_id = ANY($2::bigint[])) OR (cardinality($3::bigint[]) > 0 AND distributor_id = ANY($3::bigint[])) OR COALESCE(reference, '') ~* $4 OR COALESCE(notes, '') ~* $4 OR COALESCE(client_request_id, '') ~* $4",
        params: [
          smokePurchaseOrderPaymentIds,
          smokePurchaseOrderIds,
          smokeDistributorIds,
          SMOKE_MESSAGE_REGEX,
        ],
      },
      {
        tableName: 'distributor_ledger',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND distributor_id = ANY($1::bigint[])) OR (cardinality($2::text[]) > 0 AND COALESCE(source_id, '') = ANY($2::text[])) OR COALESCE(reference, '') ~* $3 OR COALESCE(description, '') ~* $3",
        params: [
          smokeDistributorIds,
          uniqueTexts([
            ...smokePurchaseOrderIds.map(String),
            ...smokePurchaseOrderPaymentIds.map(String),
          ]),
          SMOKE_MESSAGE_REGEX,
        ],
      },
      {
        tableName: 'purchase_orders',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND id = ANY($1::bigint[])) OR (cardinality($2::bigint[]) > 0 AND distributor_id = ANY($2::bigint[])) OR COALESCE(notes, '') ~* $3 OR COALESCE(po_number, '') ~* $3 OR COALESCE(bill_number, '') ~* $3 OR COALESCE(invoice_number, '') ~* $3 OR COALESCE(client_request_id, '') ~* $3",
        params: [smokePurchaseOrderIds, smokeDistributorIds, SMOKE_MESSAGE_REGEX],
      },
      {
        tableName: 'offers',
        whereClause:
          '(cardinality($1::bigint[]) > 0 AND apply_to_product = ANY($1::bigint[])) OR (cardinality($1::bigint[]) > 0 AND buy_product_id = ANY($1::bigint[])) OR (cardinality($1::bigint[]) > 0 AND get_product_id = ANY($1::bigint[]))',
        params: [smokeProductIds],
      },
      {
        tableName: 'product_recommendations',
        whereClause:
          '(cardinality($1::bigint[]) > 0 AND user_id = ANY($1::bigint[])) OR (cardinality($1::bigint[]) > 0 AND resolved_by = ANY($1::bigint[]))',
        params: [smokeUserIds],
      },
      {
        tableName: 'admin_audit_logs',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND actor_user_id = ANY($1::bigint[])) OR COALESCE(request_id, '') ~* $2 OR COALESCE(details_json::text, '') ~* $2 OR COALESCE(details_json::text, '') ~* $3",
        params: [smokeUserIds, SMOKE_MESSAGE_REGEX, SMOKE_EMAIL_REGEX],
      },
      {
        tableName: 'products',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND id = ANY($1::bigint[])) OR COALESCE(sku, '') LIKE 'SMK-%' OR COALESCE(name, '') ILIKE 'Smoke Product%' OR COALESCE(name, '') ILIKE 'Smoke PO Product%' OR COALESCE(name, '') ILIKE 'Category Tree Product%' OR COALESCE(description, '') ILIKE '%category tree smoke%'",
        params: [smokeProductIds],
      },
      {
        tableName: 'distributors',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND id = ANY($1::bigint[])) OR COALESCE(name, '') ILIKE 'Smoke Distributor%' OR COALESCE(contacts, '') ~* $2",
        params: [smokeDistributorIds, SMOKE_MESSAGE_REGEX],
      },
      {
        tableName: 'users',
        whereClause:
          "(cardinality($1::bigint[]) > 0 AND id = ANY($1::bigint[])) OR COALESCE(email, '') ~* $2 OR (COALESCE(name, '') ~* '^Smoke (Admin|Customer)' AND COALESCE(email, '') ILIKE '%@example.com') OR (COALESCE(name, '') ~* '^Category Smoke Admin' AND COALESCE(email, '') ILIKE '%@example.com') OR (password_hash = 'smoke-hash' AND COALESCE(email, '') ILIKE '%@example.com')",
        params: [smokeUserIds, SMOKE_EMAIL_REGEX],
      },
    ];

    const results = [];
    for (const op of operations) {
      // eslint-disable-next-line no-await-in-loop
      const row = await summarizeAndDelete(op.tableName, op.whereClause, op.params);
      results.push(row);
    }

    const categoriesWhereClause =
      "(cardinality($1::bigint[]) > 0 AND id = ANY($1::bigint[])) OR COALESCE(name, '') ILIKE 'CAT_PARENT_A_%' OR COALESCE(name, '') ILIKE 'CAT_PARENT_B_%' OR COALESCE(name, '') ILIKE 'CAT_ROOT_%' OR COALESCE(name, '') ILIKE 'CAT_MID_%' OR COALESCE(name, '') ILIKE 'CAT_LEAF_%' OR COALESCE(name, '') ILIKE 'Category Smoke %' OR COALESCE(description, '') ILIKE '%category tree smoke%'";
    const categoriesResult = await summarizeAndDeleteCategoriesLeafFirst(categoriesWhereClause, [
      smokeCategoryIds,
    ]);
    results.push(categoriesResult);

    if (dryRun) {
      await pool.query('ROLLBACK');
    } else {
      await pool.query('COMMIT');
    }

    const existingRows = results.filter((row) => row.exists);
    const matchedTotal = existingRows.reduce((sum, row) => sum + row.matched, 0);
    const deletedTotal = existingRows.reduce((sum, row) => sum + row.deleted, 0);

    console.log('[SMOKE-CLEANUP] Summary');
    console.log(`[SMOKE-CLEANUP] Smoke users found: ${smokeUserIds.length}`);
    console.log(`[SMOKE-CLEANUP] Smoke products found: ${smokeProductIds.length}`);
    console.log(`[SMOKE-CLEANUP] Smoke categories found: ${smokeCategoryIds.length}`);
    console.log(`[SMOKE-CLEANUP] Smoke distributors found: ${smokeDistributorIds.length}`);
    console.log(`[SMOKE-CLEANUP] Smoke purchase orders found: ${smokePurchaseOrderIds.length}`);
    console.log(
      `[SMOKE-CLEANUP] Smoke purchase order payments found: ${smokePurchaseOrderPaymentIds.length}`
    );
    console.log(`[SMOKE-CLEANUP] Smoke orders found: ${smokeOrderIds.length}`);
    console.log(`[SMOKE-CLEANUP] Smoke bills found: ${smokeBillIds.length}`);
    console.log(`[SMOKE-CLEANUP] Rows matched across tables: ${matchedTotal}`);
    console.log(
      `[SMOKE-CLEANUP] Rows ${dryRun ? 'would be deleted' : 'deleted'}: ${dryRun ? matchedTotal : deletedTotal}`
    );

    for (const row of existingRows) {
      if (row.matched > 0) {
        console.log(
          `[SMOKE-CLEANUP] ${row.tableName}: matched=${row.matched}${dryRun ? '' : ` deleted=${row.deleted}`}`
        );
      }
    }

    if (failOnMatches && matchedTotal > 0) {
      throw new Error(
        `Smoke residue detected after cleanup verification: ${matchedTotal} rows still matched`
      );
    }
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await pool.end().catch(() => {});
  }
};

run().catch((error) => {
  console.error(`[SMOKE-CLEANUP] Failed: ${error.message}`);
  process.exit(1);
});
