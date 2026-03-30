const {
  SUPPORTED_OFFER_TYPES,
  normalizeOfferType,
  normalizeOfferStatus,
  normalizeOfferRecord,
  getOfferLabel,
  loadActiveOffers,
  loadProductsByIds,
  resolveOfferEligibilityContext,
  previewOfferPricing,
  invalidateActiveOfferCache,
} = require('../../offers/offerEngine');
const { validateOfferPayload } = require('./offers/offerPayload');
const { sendRouteError } = require('../../../core/routeErrors');

const registerOffersRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    logAdminAuditAsync,
    getAuthUserFromRequest,
  } = deps;

  app.get('/api/offers', requireAdmin, async (_, res) => {
    try {
      return res.json(await dbAllAsync(`SELECT * FROM offers ORDER BY created_at DESC`));
    } catch (error) {
      return sendRouteError(res, error, { fallbackMessage: 'Failed to load offers' });
    }
  });

  app.post('/api/offers/preview', async (req, res) => {
    try {
      const body = req.body || {};
      const includeTax = String(body.context || '').trim().toLowerCase() !== 'billing';
      const items = Array.isArray(body.items) ? body.items : [];
      const rawOfferContext = body.offer_context || body.offerContext || {};
      const offerContext = rawOfferContext && typeof rawOfferContext === 'object' ? { ...rawOfferContext } : {};
      const resolveAuthUser = async () => {
        if (typeof getAuthUserFromRequest === 'function') {
          return getAuthUserFromRequest(req);
        }
        const appResolver = req.app?.locals?.getAuthUserFromRequest;
        if (typeof appResolver === 'function') {
          return appResolver(req);
        }
        return req.authUser || null;
      };
      const resolvedAuthUser = await resolveAuthUser();
      const authUserId = Number(resolvedAuthUser?.id || 0) || 0;
      if (authUserId > 0) {
        offerContext.customer_user_id = authUserId;
        offerContext.customerUserId = authUserId;
        offerContext.user_id = authUserId;
        offerContext.userId = authUserId;
      } else {
        delete offerContext.customer_user_id;
        delete offerContext.customerUserId;
        delete offerContext.user_id;
        delete offerContext.userId;
      }
      const eligibilityContext = await resolveOfferEligibilityContext(dbGetAsync, offerContext);
      const productIds = items
        .map((item) => Number(item?.product_id || item?.productId || 0))
        .filter((productId) => productId > 0);
      const [productsById, activeOffers] = await Promise.all([
        loadProductsByIds(dbAllAsync, productIds),
        loadActiveOffers(dbAllAsync),
      ]);
      const previewResult = previewOfferPricing({
        items,
        productsById,
        offers: activeOffers,
        offersArePrepared: true,
        eligibilityContext,
        includeTax,
      });
      if (process.env.NODE_ENV === 'test') {
        const authHeader = String(req.headers.authorization || '');
        const appResolver = req.app?.locals?.getAuthUserFromRequest;
        return res.json({
          ...previewResult,
          debug: {
            auth_user_id: authUserId || null,
            has_auth_resolver: typeof getAuthUserFromRequest === 'function' || typeof appResolver === 'function',
            has_auth_header: Boolean(authHeader.trim()),
            auth_header_prefix: authHeader.slice(0, 12),
            eligibility_context: eligibilityContext || null,
          },
        });
      }
      return res.json(previewResult);
    } catch (error) {
      return sendRouteError(res, error, { fallbackMessage: 'Failed to preview offers' });
    }
  });

  app.post('/api/offers', requireAdmin, async (req, res) => {
    try {
      const validation = await validateOfferPayload({
        payload: req.body,
        partial: false,
        dbGetAsync,
        normalizeOfferType,
        normalizeOfferStatus,
        SUPPORTED_OFFER_TYPES,
      });
      if (validation.errors.length) {
        return res.status(400).json({ error: validation.errors.join('. ') });
      }
      const b = validation.value;
      const result = await dbRunAsync(
        `INSERT INTO offers
        (name, description, type, value, min_quantity, apply_to_category, apply_to_product, buy_product_id, buy_quantity, get_product_id, get_quantity, start_date, end_date, start_at, end_at, status, first_order_only)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          b.name,
          b.description || null,
          b.type,
          Number(b.value || 0),
          Number(b.min_quantity || 1),
          b.apply_to_category || null,
          b.apply_to_product || null,
          b.buy_product_id || null,
          Number(b.buy_quantity || 1),
          b.get_product_id || null,
          Number(b.get_quantity || 1),
          b.start_date || null,
          b.end_date || null,
          b.start_at || null,
          b.end_at || null,
          b.status || 'active',
          Boolean(b.first_order_only),
        ]
      );
      const created = await dbGetAsync(`SELECT * FROM offers WHERE id = ?`, [result.lastInsertRowid]);
      invalidateActiveOfferCache();
      await logAdminAuditAsync(req, {
        action: 'offer.create',
        entityType: 'offer',
        entityId: result.lastInsertRowid,
        details: { ...normalizeOfferRecord(created), label: getOfferLabel(created) },
      });
      return res.status(201).json(created);
    } catch (error) {
      return sendRouteError(res, error, { fallbackMessage: 'Failed to create offer' });
    }
  });

  app.put('/api/offers/:id', requireAdmin, async (req, res) => {
    try {
      const cur = await dbGetAsync(`SELECT * FROM offers WHERE id = ?`, [req.params.id]);
      if (!cur) return res.status(404).json({ error: 'Offer not found' });
      const mergedPayload = { ...cur, ...(req.body || {}) };
      const validation = await validateOfferPayload({
        payload: mergedPayload,
        partial: false,
        dbGetAsync,
        normalizeOfferType,
        normalizeOfferStatus,
        SUPPORTED_OFFER_TYPES,
      });
      if (validation.errors.length) {
        return res.status(400).json({ error: validation.errors.join('. ') });
      }
      const b = validation.value;
      await dbRunAsync(
        `UPDATE offers SET
         name=?, description=?, type=?, value=?, min_quantity=?, apply_to_category=?, apply_to_product=?, buy_product_id=?, buy_quantity=?, get_product_id=?, get_quantity=?, start_date=?, end_date=?, start_at=?, end_at=?, status=?, first_order_only=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [
          b.name ?? cur.name,
          b.description ?? cur.description,
          b.type ?? cur.type,
          Number(b.value ?? cur.value ?? 0),
          Number(b.min_quantity ?? cur.min_quantity ?? 1),
          b.apply_to_category ?? cur.apply_to_category,
          b.apply_to_product ?? cur.apply_to_product,
          b.buy_product_id ?? cur.buy_product_id,
          Number(b.buy_quantity ?? cur.buy_quantity ?? 1),
          b.get_product_id ?? cur.get_product_id,
          Number(b.get_quantity ?? cur.get_quantity ?? 1),
          b.start_date ?? cur.start_date,
          b.end_date ?? cur.end_date,
          b.start_at ?? cur.start_at,
          b.end_at ?? cur.end_at,
          b.status ?? cur.status,
          Boolean(b.first_order_only),
          req.params.id,
        ]
      );
      const updated = await dbGetAsync(`SELECT * FROM offers WHERE id = ?`, [req.params.id]);
      invalidateActiveOfferCache();
      await logAdminAuditAsync(req, {
        action: 'offer.update',
        entityType: 'offer',
        entityId: req.params.id,
        details: { ...normalizeOfferRecord(updated), label: getOfferLabel(updated) },
      });
      return res.json(updated);
    } catch (error) {
      return sendRouteError(res, error, { fallbackMessage: 'Failed to update offer' });
    }
  });

  app.delete('/api/offers/:id', requireAdmin, async (req, res) => {
    try {
      const existing = await dbGetAsync(`SELECT * FROM offers WHERE id = ?`, [req.params.id]);
      if (!existing) return res.status(404).json({ error: 'Offer not found' });
      await dbRunAsync(`DELETE FROM offers WHERE id = ?`, [req.params.id]);
      invalidateActiveOfferCache();
      await logAdminAuditAsync(req, {
        action: 'offer.delete',
        entityType: 'offer',
        entityId: req.params.id,
        details: { ...normalizeOfferRecord(existing), label: getOfferLabel(existing) },
      });
      return res.json({ success: true });
    } catch (error) {
      return sendRouteError(res, error, { fallbackMessage: 'Failed to delete offer' });
    }
  });
};

module.exports = { registerOffersRoutes };
