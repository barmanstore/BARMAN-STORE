const registerCreditIssuesListRoutes = (deps) => {
  const {
    app,
    requireAuth,
    dbAllAsync,
    dbGetAsync,
    normalizeCreditIssueStatus,
    getLatestCreditEntryAsync,
    getCustomerCreditProfileAsync,
    buildPaymentActivityBadges,
  } = deps;

  const CREDIT_HISTORY_DEFAULT_LIMIT = 150;
  const CREDIT_HISTORY_MAX_LIMIT = 500;
  const creditHistorySelect = `
    SELECT ch.*,
           COALESCE(primary_bill.id, legacy_bill.id) AS linked_bill_id,
           COALESCE(primary_bill.bill_number, legacy_bill.bill_number, NULL) AS linked_bill_number,
           CASE
             WHEN COALESCE(ch.source_type, '') = 'bill'
               THEN COALESCE(primary_bill.bill_number, legacy_bill.bill_number, ch.source_label, ch.reference, '')
             ELSE COALESCE(ch.source_label, ch.reference, '')
           END AS resolved_source_label,
           EXISTS(
             SELECT 1
             FROM credit_history rev
             WHERE rev.user_id = ch.user_id
               AND rev.reversed_entry_id = ch.id
               AND COALESCE(rev.source_type, '') = 'reversal'
           ) AS has_reversal
    FROM credit_history ch
    LEFT JOIN bills primary_bill
      ON COALESCE(ch.source_type, '') = 'bill'
     AND COALESCE(ch.source_id, '') <> ''
     AND (
       CAST(primary_bill.id AS TEXT) = CAST(ch.source_id AS TEXT)
       OR primary_bill.bill_number = ch.source_id
     )
    LEFT JOIN bills legacy_bill
      ON COALESCE(ch.source_type, '') IN ('', 'adjustment')
     AND LOWER(COALESCE(ch.type, '')) = 'given'
     AND COALESCE(ch.reference, '') <> ''
     AND COALESCE(ch.description, '') LIKE 'Bill credit |%'
     AND legacy_bill.bill_number = ch.reference
  `;

  const encodeHistoryCursor = (cursorPayload) => {
    if (!cursorPayload) return '';
    try {
      return Buffer.from(JSON.stringify(cursorPayload), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    } catch (_) {
      return '';
    }
  };

  const decodeHistoryCursor = (cursor) => {
    if (!cursor) return null;
    try {
      const normalized = String(cursor).replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '==='.slice((normalized.length + 3) % 4);
      const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
      if (!Array.isArray(parsed) || parsed.length < 3) return null;
      return {
        sortTs: parsed[0],
        createdAt: parsed[1],
        id: Number(parsed[2] || 0),
      };
    } catch (_) {
      return null;
    }
  };

  app.get('/api/users/:userId/credit-history', requireAuth, async (req, res) => {
    try {
      const requestUserId = Number(req.params.userId);
      const isAdmin = req.authUser?.role === 'admin';
      if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const allowAll = ['1', 'true', 'yes'].includes(
        String(req.query?.all || '')
          .trim()
          .toLowerCase()
      );
      const rawLimit = Number(req.query?.limit || 0);
      const resolvedLimit = allowAll
        ? null
        : Math.min(
            Math.max(
              Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : CREDIT_HISTORY_DEFAULT_LIMIT,
              1
            ),
            CREDIT_HISTORY_MAX_LIMIT
          );
      const cursor = allowAll ? null : decodeHistoryCursor(String(req.query?.cursor || '').trim());
      const sortExpr = 'ch.transaction_ts';
      const whereClauses = ['ch.user_id = ?'];
      const params = [req.params.userId];
      if (cursor && cursor.sortTs !== undefined && cursor.sortTs !== null && cursor.id) {
        whereClauses.push(`(
          ${sortExpr} < ?
          OR (${sortExpr} = ? AND ch.created_at < ?)
          OR (${sortExpr} = ? AND ch.created_at = ? AND ch.id < ?)
        )`);
        params.push(
          cursor.sortTs,
          cursor.sortTs,
          cursor.createdAt,
          cursor.sortTs,
          cursor.createdAt,
          cursor.id
        );
      }
      if (resolvedLimit) {
        params.push(resolvedLimit + 1);
      }

      const rows = await dbAllAsync(
        `${creditHistorySelect}
         WHERE ${whereClauses.join(' AND ')}
         ORDER BY ${sortExpr} DESC, ch.created_at DESC, ch.id DESC
         ${resolvedLimit ? 'LIMIT ?' : ''}`,
        params
      );

      if (!resolvedLimit) {
        return res.json({ rows, nextCursor: null, hasMore: false });
      }

      const hasMore = rows.length > resolvedLimit;
      const slicedRows = hasMore ? rows.slice(0, resolvedLimit) : rows;
      const lastRow = slicedRows[slicedRows.length - 1];
      const nextCursor =
        hasMore && lastRow
          ? encodeHistoryCursor([lastRow.transaction_ts, lastRow.created_at, lastRow.id])
          : null;
      return res.json({ rows: slicedRows, nextCursor, hasMore });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/users/:userId/payment-badges', requireAuth, async (req, res) => {
    try {
      const requestUserId = Number(req.params.userId);
      const isAdmin = req.authUser?.role === 'admin';
      if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const [historyRows, latest, userRow, creditProfile] = await Promise.all([
        dbAllAsync(
          `SELECT id, type, amount, transaction_ts, transaction_date, due_date, created_at, source_type, source_label, reference
           FROM credit_history
           WHERE user_id = ?
           ORDER BY transaction_ts ASC, created_at ASC, id ASC`,
          [req.params.userId]
        ),
        getLatestCreditEntryAsync(requestUserId),
        dbGetAsync(`SELECT credit_limit FROM users WHERE id = ?`, [requestUserId]),
        getCustomerCreditProfileAsync(requestUserId),
      ]);

      const badgePayload = buildPaymentActivityBadges(historyRows, {
        balance: Number(latest?.balance || 0),
        creditLimit: Number(userRow?.credit_limit || 0),
        nowMs: Date.now(),
        isActive: creditProfile?.is_active,
        graceDays: creditProfile?.grace_days,
      });
      return res.json(badgePayload);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/users/:userId/credit-issues', requireAuth, async (req, res) => {
    try {
      const requestUserId = Number(req.params.userId);
      if (!requestUserId) return res.status(400).json({ error: 'Invalid user id' });
      const isAdmin = req.authUser?.role === 'admin';
      if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const requestedStatus = String(req.query?.status || '')
        .trim()
        .toLowerCase();
      const normalizedStatus = requestedStatus
        ? normalizeCreditIssueStatus(requestedStatus, { fallback: '' })
        : '';
      if (requestedStatus && !normalizedStatus) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
      const rows = await dbAllAsync(
        `SELECT cei.*,
                corr.amount as correction_amount,
                corr.type as correction_type,
                corr.reference as correction_reference
         FROM credit_entry_issues cei
         LEFT JOIN credit_history corr ON corr.id = cei.correction_entry_id
         WHERE cei.user_id = ?
           ${normalizedStatus ? 'AND cei.status = ?' : ''}
         ORDER BY cei.created_at DESC`,
        normalizedStatus ? [requestUserId, normalizedStatus] : [requestUserId]
      );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCreditIssuesListRoutes };
