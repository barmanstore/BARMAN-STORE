require('./loadEnv');
const express = require('express');
const cors = require('cors');
const { AsyncLocalStorage } = require('async_hooks');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const XLSX = require('xlsx');
const { parseBooleanEnv } = require('./core/envUtils');
const { createBootstrapConfig } = require('./core/bootstrap/config');
const { applyHttpBootstrap } = require('./core/bootstrap/http');
const { createBootstrapProviders } = require('./core/bootstrap/providers');
const { createBootstrapDatabase } = require('./core/bootstrap/db');
const { createBootstrapWorkers } = require('./core/bootstrap/workers');
const { registerAppFeatures } = require('./core/bootstrap/features');
const { createRequestUtils } = require('./core/requestUtils');
const { startRuntime } = require('./core/runtime');
const { createRateLimiter } = require('./core/rateLimiter');
const { isUniqueViolationError } = require('./core/dbUtils');
const {
  SQL_INSERT_IGNORE_CATEGORY,
  SQL_UPSERT_VISITOR_SESSION,
  SQL_UPSERT_IMPORT_BATCH,
  SQL_CAST_TO_INT,
} = require('./core/sqlConstants');
const {
  createPostgresPool,
  getPostgresConnectionLabel,
  pingPostgresPool,
} = require('./db/postgresScaffold');
const { normalizeExecutionMode } = require('./db/executionAdapter');
const { createQueryAdapter } = require('./db/queryAdapter');
const {
  applyPostgresMigrations,
  ensurePostgresBootstrapData,
} = require('./db/postgresBootstrap');
const { registerAuthFeature, registerCommunicationFeature, registerCatalogFeature, registerSalesFeature, registerCommerceFeature, registerCreditFeature } = require('./features');
const { createAuthSupport, sanitizeUser, createProfileImageUtils } = require('./features/auth');
const { createCommerceNotificationUtils, createDistributorUtils } = require('./features/commerce');
const { createAdminAuditLogger } = require('./core/adminAudit');
const { createValidateCustomerProfile } = require('./utils/customerValidation');
const { createProductHelpers } = require('./utils/productUtils');
const { generateSku } = require('./utils/skuUtils');
const {
  createPurchaseItemUtils,
  createPurchaseDuplicateUtils,
  createPurchaseOrderStatusUtils,
  createPurchaseAnalyticsUtils,
  createInventoryUtils,
  createPurchaseAnalyticsSnapshotUtils,
  createPurchaseDateUtils,
  createDistributorProductKnowledgeUtils,
  createPurchaseTransactionUtils,
  generatePONumber,
  generateReturnNumber,
  PO_LIFECYCLE_PREPARED,
  PO_LIFECYCLE_SENT,
  PO_LIFECYCLE_REVISED,
  PO_LIFECYCLE_CONFIRMED,
  PO_LIFECYCLE_PART_PAID,
  PO_LIFECYCLE_FULLY_PAID,
  PO_LIFECYCLE_CLOSED,
  PO_LIFECYCLE_CANCELLED,
  PO_PAYMENT_UNPAID,
  PO_PAYMENT_PART_PAID,
  PO_PAYMENT_PAID,
  PURCHASE_WEEKDAYS,
  PURCHASE_ACTION_ROLLUP_FIELDS,
  PURCHASE_ACTION_STATUS_MAP,
} = require('./features/purchase');
const {
  generateOrderNumber,
  generateBillNumber,
  ORDER_STATUS_ORDERED,
  ORDER_STATUS_RECEIVED,
  normalizeOrderStatus,
  normalizeOrderPaymentStatus,
  normalizePaymentMethod,
} = require('./features/sales');
const { createDistributorLedgerUtils } = require('./utils/distributorLedgerUtils');
const { createContactUtils } = require('./utils/contactUtils');
const {
  createNotificationUtils,
  createVerificationUtils,
  createContactVerificationUtils,
  createNotificationRetentionUtils,
  createNotificationRetentionWorker,
} = require('./features/notifications');
const {
  createCustomerRequestRetentionUtils,
  createCustomerRequestRetentionWorker,
  createPhoneChangeService,
} = require('./features/customerRequests');
const { createCreditUtils } = require('./features/credits');
const { createPurchaseOperationsService } = require('./services/purchaseOperationsService');
const { createAuthMiddleware } = require('./middleware/authMiddleware');

const app = express();

const defaultAllowedOrigins = [
  'http://localhost',
  'http://127.0.0.1',
  'https://barman-store.vercel.app',
  'https://barmanstore.vercel.app',
];
const config = createBootstrapConfig({
  env: process.env,
  baseDir: __dirname,
  path,
  parseBooleanEnv,
  normalizeExecutionMode,
  defaultAllowedOrigins,
});
const {
  corsOptions,
  PORT,
  DB_EXECUTION_MODE,
  UPLOADS_DIR,
  PROFILE_UPLOAD_DIR,
  POSTGRES_MIGRATIONS_DIR,
  IS_VERCEL_RUNTIME,
  CANONICAL_HOST,
  LEGACY_HOSTS,
  PURCHASE_STOCK_CAP,
  SALT_ROUNDS,
  VISITOR_ONLINE_WINDOW_MINUTES,
  AUTH_FLOW_MODE,
  PASSWORD_RESET_MODE,
  PHONE_VERIFICATION_REQUIRED,
  OTP_PROVIDER,
  OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
  AUTH_LOGIN_OTP_EXPOSE_CODE,
  OTP_DELIVERY_MODE,
  EMAIL_DELIVERY_MODE,
  EMAIL_VERIFICATION_MODE,
  WHATSAPP_DELIVERY_MODE,
  WHATSAPP_PROVIDER,
  SUPABASE_AUTH_ENABLED,
  SUPABASE_AUTH_MODE,
  SUPABASE_ACCESS_TOKEN_DECODE_FALLBACK,
  SUPABASE_EMAIL_VERIFY_REDIRECT,
  EMAIL_VERIFY_BASE_URL,
  PHONE_VERIFY_BASE_URL,
  EMAIL_VERIFY_TTL_SECONDS,
  EMAIL_VERIFY_MAX_ATTEMPTS,
  PHONE_VERIFY_TTL_SECONDS,
  PHONE_VERIFY_MAX_ATTEMPTS,
  OTP_VERIFY_SESSION_TTL_SECONDS,
  CREDIT_ENTRY_DEDUP_WINDOW_MS,
  PHONE_CHANGE_STATUS_PENDING,
  PHONE_CHANGE_STATUS_APPROVED,
  PHONE_CHANGE_STATUS_REJECTED,
  PHONE_CHANGE_DECISION_AUTO,
  PHONE_CHANGE_DECISION_ADMIN,
  PHONE_CHANGE_EXPIRED_REASON,
  PHONE_CHANGE_CRON_SECRET,
  PHONE_CHANGE_CRON_ENABLED,
  PHONE_CHANGE_AUTO_APPROVE_DELAY_MS,
  PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS,
  PHONE_CHANGE_PROCESS_INTERVAL_MS,
  PHONE_CHANGE_AUTO_BATCH_SIZE,
  PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
  PURCHASE_OPERATIONS_NOTIFICATION_INTERVAL_MS,
  APP_NOTIFICATION_RETENTION_DAYS,
  APP_NOTIFICATION_PURGE_BATCH_LIMIT,
  APP_NOTIFICATION_PURGE_INTERVAL_MS,
  CUSTOMER_REQUEST_RETENTION_DAYS,
  CUSTOMER_REQUEST_PURGE_BATCH_LIMIT,
  CUSTOMER_REQUEST_PURGE_INTERVAL_MS,
  BUSINESS_NAME,
  DEFAULT_COUNTRY_CODE,
  AUTH_TOKEN_SECRET,
  TOKEN_TTL_MS,
} = config;

const {
  otpProvider,
  emailVerificationProvider,
  whatsappProvider,
  notificationService,
  supabaseAuthProvider,
} = createBootstrapProviders({ config, env: process.env });
const {
  parsePhoneInput,
  normalizePhone,
  normalizeEmail,
  isStrongPassword,
  generateTemporaryPassword,
  generateOtpCode,
  generatePhoneVerificationCode,
  hashOpaqueToken,
  generateEmailVerificationToken,
  hashVerificationToken,
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  getBearerTokenFromRequest,
} = createAuthSupport({
  bcrypt,
  crypto,
  saltRounds: SALT_ROUNDS,
  authTokenSecret: AUTH_TOKEN_SECRET,
  tokenTtlMs: TOKEN_TTL_MS,
});
const validateCustomerProfile = createValidateCustomerProfile(normalizePhone);
const {
  toTimestampMs,
  generateVisitorSessionId,
  normalizeVisitorSessionId,
  sanitizeTrackedPath,
  sanitizeShortText,
  getRequestIp,
  hashVisitorIp,
  normalizeClientRequestId,
  resolveClientRequestId,
  safeSerializeJson,
} = createRequestUtils({ crypto });

const {
  dbRunAsync,
  dbGetAsync,
  dbAllAsync,
  dbTxAsync,
  ensureRuntimeReady,
  closePostgresScaffold,
} = createBootstrapDatabase({
  config,
  AsyncLocalStorage,
  createPostgresPool,
  pingPostgresPool,
  getPostgresConnectionLabel,
  applyPostgresMigrations,
  ensurePostgresBootstrapData,
  createQueryAdapter,
  normalizeEmail,
  isStrongPassword,
  hashPassword,
  generateSku,
});
app.closeRuntime = closePostgresScaffold;

const { authIpLimiter, emailVerificationLimiter } = applyHttpBootstrap({
  app,
  express,
  cors,
  corsOptions,
  fs,
  UPLOADS_DIR,
  PROFILE_UPLOAD_DIR,
  IS_VERCEL_RUNTIME,
  CANONICAL_HOST,
  LEGACY_HOSTS,
  ensureRuntimeReady,
  createRateLimiter,
});
const { logAdminAuditAsync } = createAdminAuditLogger({
  dbRunAsync,
  safeSerializeJson,
  getRequestIp,
});

const PROFILE_IMAGE_MAX_BYTES = Math.max(
  32 * 1024,
  Number(process.env.PROFILE_IMAGE_MAX_BYTES || 2 * 1024 * 1024)
);
const {
  mimeToExt,
  PROFILE_IMAGE_ALLOWED_MIME,
  parseDataUrlImage,
  buildProfileImagePath,
  deleteManagedProfileImage,
} = createProfileImageUtils({
  fs,
  path,
  profileUploadDir: PROFILE_UPLOAD_DIR,
});



const {
  PRODUCT_IMPORT_BATCH_TTL_MS,
  PRODUCT_IMPORT_HEADERS,
  PRODUCT_IMPORT_SAMPLE,
  productImportBatches,
  normalizeProductRecord,
  normalizeProductInput,
  validateProductPayload,
  findProductConflictAsync,
  resolveOrCreateCategoryNameAsync,
  parseProductFileToRows,
  findExistingProductForImportAsync,
  normalizeTextKey,
  buildProductExactKey,
  createImportBatchChecksum,
  cleanupExpiredImportBatches,
  applyProductImportBatch,
  toProductExportRow,
} = createProductHelpers({
  dbAllAsync,
  dbGetAsync,
  dbRunAsync,
  dbTxAsync,
  XLSX,
  crypto,
  path,
  SQL_INSERT_IGNORE_CATEGORY,
});

const {
  normalizeBooleanFlag,
  normalizeWeekdayLabel,
  addDaysToDateKey,
  getWeekdayFromDateKey,
  getDaysBetweenDateKeys,
  buildDateSeries,
  resolveRollupRange,
  normalizeTransactionDate,
  resolveInsightDateRange,
  normalizeDistributorPaymentCycleType,
  inferPaymentDueDaysFromTerms,
  getDistributorPaymentPlan,
  computePurchasePaymentDueDate,
  getDistributorOrderScheduleDay,
  getEffectivePurchaseDueDateKey,
  getPurchaseOrderAnchorDateKey,
  getPurchaseOrderDeliveryDateKey,
  getPurchaseOrderPaymentAnchorDateKey,
} = createPurchaseDateUtils({
  PURCHASE_WEEKDAYS,
});

const {
  normalizePurchaseUomToken,
  getPurchaseProductUomProfile,
  getAllowedPurchaseUnitsForProductRow,
  toPurchaseBaseQty,
  normalizePurchaseOrderItems,
  createPurchaseConflictError,
} = createPurchaseItemUtils({
  dbGetAsync,
});

const {
  acquirePurchaseDuplicateLockAsync,
  buildPurchaseDuplicateKey,
  findDuplicatePurchaseOrderAsync,
  findDuplicateDistributorBillAsync,
  findDuplicatePurchasePaymentAsync,
} = createPurchaseDuplicateUtils({
  dbGetAsync,
  crypto,
  normalizeTransactionDate,
  PO_LIFECYCLE_CANCELLED,
});

const {
  getDistributorLedgerRows,
  createDistributorLedgerEntry,
  handleDistributorLedgerCreate,
} = createDistributorLedgerUtils({
  dbAllAsync,
  dbGetAsync,
  dbRunAsync,
  SQL_CAST_TO_INT,
});

const {
  normalizePoLifecycleStatus,
  getPurchaseOrderLifecycleStatus,
  normalizePoPaymentStatus,
  calculatePoPaymentSnapshot,
  derivePoLifecycleFromPaymentStatus,
  isPoEditableLifecycle,
  canPoAcceptPayment,
  canPoReceiveInventory,
  derivePurchaseNextAction,
  recordPurchaseOrderStatusHistoryAsync,
} = createPurchaseOrderStatusUtils({
  dbRunAsync,
  PO_LIFECYCLE_PREPARED,
  PO_LIFECYCLE_SENT,
  PO_LIFECYCLE_REVISED,
  PO_LIFECYCLE_CONFIRMED,
  PO_LIFECYCLE_PART_PAID,
  PO_LIFECYCLE_FULLY_PAID,
  PO_LIFECYCLE_CLOSED,
  PO_LIFECYCLE_CANCELLED,
  PO_PAYMENT_UNPAID,
  PO_PAYMENT_PART_PAID,
  PO_PAYMENT_PAID,
});

const {
  computeAverageDays,
  computeAverageGapDays,
  computeStdDev,
  deriveStockoutRisk,
  pickLatestDateKey,
  pickEarliestDateKey,
} = createPurchaseAnalyticsUtils();

const {
  parseDistributorProductsSupplied,
  buildDistributorProductsSuppliedText,
  mergeDistributorProductKnowledge,
} = createDistributorProductKnowledgeUtils();

const {
  syncDistributorProductsSuppliedAsync,
  recordProductCostHistoryEntryAsync,
  upsertSupplierProductsAsync,
  logStockLedgerAsync,
} = createInventoryUtils({
  dbGetAsync,
  dbRunAsync,
  mergeDistributorProductKnowledge,
});

const {
  parseOrderAddress,
  getNormalizedPhoneFromUnknownText,
  getDistributorWhatsappPhone,
} = createContactUtils({
  normalizePhone,
});

const {
  normalizeCreditType,
  normalizeCreditIssueStatus,
  buildCreditTransactionTimestamp,
  getLatestCreditEntryAsync,
  recalculateCreditBalancesForUser,
  resolveCreditEntryTimestampMs,
  buildPaymentActivityBadges,
} = createCreditUtils({
  dbGetAsync,
  dbAllAsync,
  dbRunAsync,
  dbTxAsync,
  normalizeTransactionDate,
  toTimestampMs,
});

const { buildPurchaseTransactionTimestamp } = createPurchaseTransactionUtils({
  buildCreditTransactionTimestamp,
});
const {
  savePurchaseAnalyticsSnapshotAsync,
  persistPurchaseAnalyticsSnapshotsAsync,
} = createPurchaseAnalyticsSnapshotUtils({
  dbRunAsync,
  normalizeTransactionDate,
});

const {
  createNotificationEvent,
  updateNotificationEventStatus,
  parseJsonText,
  normalizeNotificationLevel,
  createAppNotification,
  notifyAdmins,
} = createNotificationUtils({
  dbRunAsync,
  dbGetAsync,
  dbAllAsync,
  normalizeClientRequestId,
  safeSerializeJson,
  isUniqueViolationError,
});

const { notifyDistributorPurchaseOrderAsync } = createCommerceNotificationUtils({
  dbGetAsync,
  dbAllAsync,
  normalizeTransactionDate,
  normalizePoPaymentStatus,
  PO_PAYMENT_UNPAID,
  createNotificationEvent,
  updateNotificationEventStatus,
  notificationService,
  whatsappProvider,
  WHATSAPP_DELIVERY_MODE,
  getDistributorWhatsappPhone,
});

const {
  normalizePhoneChangeRequestStatus,
  serializePhoneChangeRequest,
  getOpenPhoneChangeRequestForUser,
  getLatestPhoneChangeRequestForUser,
  queuePhoneChangeRequest,
  getPhoneMergeImpactSummary,
  approvePhoneChangeRequest,
  rejectPhoneChangeRequest,
  processPendingPhoneChangeRequests,
  startPhoneChangeWorker,
  stopPhoneChangeWorker,
  notifyPhoneChangeSubmitted,
  notifyPhoneChangeAdminReview,
  notifyPhoneChangeApproved,
  notifyPhoneChangeRejected,
} = createPhoneChangeService({
  dbGetAsync,
  dbAllAsync,
  dbRunAsync,
  dbTxAsync,
  parsePhoneInput,
  normalizePhone,
  createAppNotification,
  notifyAdmins,
  PHONE_CHANGE_STATUS_PENDING,
  PHONE_CHANGE_STATUS_APPROVED,
  PHONE_CHANGE_STATUS_REJECTED,
  PHONE_CHANGE_DECISION_AUTO,
  PHONE_CHANGE_DECISION_ADMIN,
  PHONE_CHANGE_AUTO_APPROVE_DELAY_MS,
  PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS,
  PHONE_CHANGE_AUTO_BATCH_SIZE,
  PHONE_CHANGE_PROCESS_INTERVAL_MS,
  PHONE_CHANGE_EXPIRED_REASON,
  IS_VERCEL_RUNTIME,
});

const {
  runPurchaseOperationNotificationsAsync,
  handlePurchaseOperationsSummary,
  startPurchaseOperationsNotificationWorker,
  stopPurchaseOperationsNotificationWorker,
  saveDistributorPurchaseReminderAsync,
} = createPurchaseOperationsService({
  dbAllAsync,
  dbGetAsync,
  dbRunAsync,
  normalizeTransactionDate,
  addDaysToDateKey,
  normalizeBooleanFlag,
  getDistributorOrderScheduleDay,
  getPurchaseOrderLifecycleStatus,
  isPoEditableLifecycle,
  getWeekdayFromDateKey,
  parseDistributorProductsSupplied,
  mergeDistributorProductKnowledge,
  getDistributorPaymentPlan,
  computeAverageDays,
  computeAverageGapDays,
  computeStdDev,
  deriveStockoutRisk,
  getPurchaseOrderPaymentAnchorDateKey,
  getPurchaseOrderAnchorDateKey,
  getPurchaseOrderDeliveryDateKey,
  getDaysBetweenDateKeys,
  pickLatestDateKey,
  pickEarliestDateKey,
  normalizePoPaymentStatus,
  getEffectivePurchaseDueDateKey,
  resolveRollupRange,
  buildDateSeries,
  normalizePoLifecycleStatus,
  resolveInsightDateRange,
  notifyAdmins,
  PURCHASE_ACTION_ROLLUP_FIELDS,
  PURCHASE_ACTION_STATUS_MAP,
  PURCHASE_WEEKDAYS,
  PO_LIFECYCLE_PREPARED,
  PO_LIFECYCLE_SENT,
  PO_LIFECYCLE_REVISED,
  PO_LIFECYCLE_CANCELLED,
  PO_LIFECYCLE_FULLY_PAID,
  PO_LIFECYCLE_CLOSED,
  PO_PAYMENT_UNPAID,
  derivePurchaseNextAction,
  persistPurchaseAnalyticsSnapshotsAsync,
  PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
  PURCHASE_OPERATIONS_NOTIFICATION_INTERVAL_MS,
  IS_VERCEL_RUNTIME,
});

const {
  createEmailVerificationRecord,
  createPhoneVerificationRecord,
  buildEmailVerificationLink,
  buildPhoneVerificationLink,
  sendPhoneVerificationChallenge,
  sendEmailVerificationChallenge,
} = createVerificationUtils({
  dbRunAsync,
  notificationService,
  createNotificationEvent,
  updateNotificationEventStatus,
  emailVerificationProvider,
  whatsappProvider,
  generateEmailVerificationToken,
  hashVerificationToken,
  generatePhoneVerificationCode,
  hashOpaqueToken,
  EMAIL_VERIFY_TTL_SECONDS,
  EMAIL_VERIFY_MAX_ATTEMPTS,
  PHONE_VERIFY_TTL_SECONDS,
  PHONE_VERIFY_MAX_ATTEMPTS,
  EMAIL_DELIVERY_MODE,
  WHATSAPP_DELIVERY_MODE,
  EMAIL_VERIFY_BASE_URL,
  PHONE_VERIFY_BASE_URL,
});

const {
  normalizeContactVerificationRequestType,
  getOpenContactVerificationRequest,
  queueContactVerificationRequest,
  markContactVerificationRequestSent,
  rejectContactVerificationRequest,
  completeContactVerificationRequests,
} = createContactVerificationUtils({
  dbGetAsync,
  dbRunAsync,
});

const {
  purgeOldAppNotificationsAsync,
  runAppNotificationPurge,
} = createNotificationRetentionUtils({
  dbRunAsync,
  APP_NOTIFICATION_RETENTION_DAYS,
  APP_NOTIFICATION_PURGE_BATCH_LIMIT,
});
const { start: startAppNotificationPurgeWorker, stop: stopAppNotificationPurgeWorker } = createNotificationRetentionWorker({
  runAppNotificationPurge,
  intervalMs: APP_NOTIFICATION_PURGE_INTERVAL_MS,
  isVercelRuntime: IS_VERCEL_RUNTIME,
});

const {
  purgeOldCustomerRequestsAsync,
  runCustomerRequestPurge,
} = createCustomerRequestRetentionUtils({
  dbRunAsync,
  PHONE_CHANGE_STATUS_APPROVED,
  PHONE_CHANGE_STATUS_REJECTED,
  CUSTOMER_REQUEST_RETENTION_DAYS,
  CUSTOMER_REQUEST_PURGE_BATCH_LIMIT,
});
const { start: startCustomerRequestPurgeWorker, stop: stopCustomerRequestPurgeWorker } = createCustomerRequestRetentionWorker({
  runCustomerRequestPurge,
  intervalMs: CUSTOMER_REQUEST_PURGE_INTERVAL_MS,
  isVercelRuntime: IS_VERCEL_RUNTIME,
});


const {
  isSupabaseEmailAuthUsable,
  isSupabaseAuthStrictMode,
  isSupabaseEmailVerified,
  toSupabaseSessionPayload,
  getSupabaseUserMetadata,
  getVerifiedPhoneFromMetadata,
  syncLocalUserFromSupabaseAuth,
  syncLocalEmailVerifiedFromSupabase,
  getAuthUserFromRequest,
  requireAuth,
  requireAdmin,
  requireCronSecret,
  requireInternalCron,
} = createAuthMiddleware({
  parsePhoneInput,
  normalizeEmail,
  dbGetAsync,
  dbRunAsync,
  hashPassword,
  generateTemporaryPassword,
  getBearerTokenFromRequest,
  verifyToken,
  sanitizeUser,
  supabaseAuthProvider,
  PHONE_CHANGE_CRON_SECRET,
  PHONE_CHANGE_CRON_ENABLED,
});
const { getDistributorByIdAsync } = createDistributorUtils({
  dbGetAsync,
});

registerAppFeatures({
  app,
  registerAuthFeature,
  registerCommunicationFeature,
  registerCatalogFeature,
  registerSalesFeature,
  registerCreditFeature,
  registerCommerceFeature,
  requireAuth,
  requireAdmin,
  requireCronSecret,
  requireInternalCron,
  authIpLimiter,
  emailVerificationLimiter,
  dbGetAsync,
  dbRunAsync,
  dbAllAsync,
  dbTxAsync,
  normalizeEmail,
  parsePhoneInput,
  normalizePhone,
  hashPassword,
  generateTemporaryPassword,
  isUniqueViolationError,
  generateOtpCode,
  OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
  notificationService,
  createNotificationEvent,
  EMAIL_DELIVERY_MODE,
  emailVerificationProvider,
  updateNotificationEventStatus,
  AUTH_LOGIN_OTP_EXPOSE_CODE,
  isSupabaseEmailAuthUsable,
  supabaseAuthProvider,
  syncLocalUserFromSupabaseAuth,
  getSupabaseUserMetadata,
  sanitizeUser,
  generateToken,
  toSupabaseSessionPayload,
  verifyPassword,
  isSupabaseAuthStrictMode,
  queueContactVerificationRequest,
  getRequestIp,
  syncLocalEmailVerifiedFromSupabase,
  completeContactVerificationRequests,
  EMAIL_VERIFY_MAX_ATTEMPTS,
  hashVerificationToken,
  getBearerTokenFromRequest,
  isSupabaseEmailVerified,
  EMAIL_VERIFICATION_MODE,
  SUPABASE_AUTH_MODE,
  WHATSAPP_DELIVERY_MODE,
  whatsappProvider,
  processPendingPhoneChangeRequests,
  getLatestPhoneChangeRequestForUser,
  serializePhoneChangeRequest,
  getOpenPhoneChangeRequestForUser,
  rejectPhoneChangeRequest,
  createAppNotification,
  PHONE_CHANGE_STATUS_REJECTED,
  PHONE_CHANGE_AUTO_BATCH_SIZE,
  normalizeContactVerificationRequestType,
  AUTH_FLOW_MODE,
  OTP_PROVIDER,
  OTP_DELIVERY_MODE,
  OTP_VERIFY_SESSION_TTL_SECONDS,
  PHONE_VERIFICATION_REQUIRED,
  WHATSAPP_PROVIDER,
  SUPABASE_EMAIL_VERIFY_REDIRECT,
  PHONE_VERIFY_MAX_ATTEMPTS,
  hashOpaqueToken,
  parseBooleanEnv,
  runCustomerRequestPurge,
  getPhoneMergeImpactSummary,
  PHONE_CHANGE_STATUS_PENDING,
  PHONE_CHANGE_STATUS_APPROVED,
  normalizePhoneChangeRequestStatus,
  approvePhoneChangeRequest,
  PHONE_CHANGE_DECISION_ADMIN,
  notifyPhoneChangeApproved,
  notifyPhoneChangeSubmitted,
  logAdminAuditAsync,
  notifyPhoneChangeRejected,
  sendEmailVerificationChallenge,
  markContactVerificationRequestSent,
  sendPhoneVerificationChallenge,
  rejectContactVerificationRequest,
  queuePhoneChangeRequest,
  parseDataUrlImage,
  PROFILE_IMAGE_ALLOWED_MIME,
  PROFILE_IMAGE_MAX_BYTES,
  mimeToExt,
  buildProfileImagePath,
  deleteManagedProfileImage,
  PROFILE_UPLOAD_DIR,
  crypto,
  path,
  fs,
  validateCustomerProfile,
  normalizeVisitorSessionId,
  generateVisitorSessionId,
  sanitizeTrackedPath,
  sanitizeShortText,
  hashVisitorIp,
  getAuthUserFromRequest,
  SQL_UPSERT_VISITOR_SESSION,
  VISITOR_ONLINE_WINDOW_MINUTES,
  purgeOldAppNotificationsAsync,
  APP_NOTIFICATION_RETENTION_DAYS,
  APP_NOTIFICATION_PURGE_BATCH_LIMIT,
  runPurchaseOperationNotificationsAsync,
  PURCHASE_OPERATIONS_NOTIFICATIONS_ENABLED,
  resolveClientRequestId,
  parseJsonText,
  safeSerializeJson,
  normalizeProductRecord,
  normalizeProductInput,
  validateProductPayload,
  findProductConflictAsync,
  resolveOrCreateCategoryNameAsync,
  XLSX,
  toProductExportRow,
  PRODUCT_IMPORT_HEADERS,
  PRODUCT_IMPORT_SAMPLE,
  cleanupExpiredImportBatches,
  parseProductFileToRows,
  findExistingProductForImportAsync,
  normalizeTextKey,
  buildProductExactKey,
  createImportBatchChecksum,
  PRODUCT_IMPORT_BATCH_TTL_MS,
  productImportBatches,
  SQL_UPSERT_IMPORT_BATCH,
  applyProductImportBatch,
  normalizeOrderStatus,
  ORDER_STATUS_ORDERED,
  ORDER_STATUS_RECEIVED,
  normalizeOrderPaymentStatus,
  parseOrderAddress,
  normalizePaymentMethod,
  generateOrderNumber,
  notifyAdmins,
  generateBillNumber,
  normalizeCreditIssueStatus,
  getLatestCreditEntryAsync,
  buildPaymentActivityBadges,
  recalculateCreditBalancesForUser,
  normalizeTransactionDate,
  buildCreditTransactionTimestamp,
  CREDIT_ENTRY_DEDUP_WINDOW_MS,
  toTimestampMs,
  acquirePurchaseDuplicateLockAsync,
  buildPurchaseDuplicateKey,
  buildPurchaseTransactionTimestamp,
  calculatePoPaymentSnapshot,
  canPoAcceptPayment,
  canPoReceiveInventory,
  computeAverageDays,
  computeAverageGapDays,
  computePurchasePaymentDueDate,
  computeStdDev,
  createDistributorLedgerEntry,
  createPurchaseConflictError,
  derivePoLifecycleFromPaymentStatus,
  derivePurchaseNextAction,
  deriveStockoutRisk,
  findDuplicateDistributorBillAsync,
  findDuplicatePurchaseOrderAsync,
  findDuplicatePurchasePaymentAsync,
  generatePONumber,
  generateReturnNumber,
  getAllowedPurchaseUnitsForProductRow,
  getDistributorByIdAsync,
  getPurchaseOrderLifecycleStatus,
  getPurchaseProductUomProfile,
  handlePurchaseOperationsSummary,
  isPoEditableLifecycle,
  logStockLedgerAsync,
  normalizePoLifecycleStatus,
  normalizePoPaymentStatus,
  normalizePurchaseOrderItems,
  normalizePurchaseUomToken,
  notifyDistributorPurchaseOrderAsync,
  recordProductCostHistoryEntryAsync,
  recordPurchaseOrderStatusHistoryAsync,
  resolveInsightDateRange,
  saveDistributorPurchaseReminderAsync,
  syncDistributorProductsSuppliedAsync,
  toPurchaseBaseQty,
  upsertSupplierProductsAsync,
  PO_LIFECYCLE_CANCELLED,
  PO_LIFECYCLE_CLOSED,
  PO_LIFECYCLE_CONFIRMED,
  PO_LIFECYCLE_FULLY_PAID,
  PO_LIFECYCLE_PART_PAID,
  PO_LIFECYCLE_PREPARED,
  PO_LIFECYCLE_REVISED,
  PO_LIFECYCLE_SENT,
  PO_PAYMENT_PAID,
  PO_PAYMENT_UNPAID,
  PURCHASE_STOCK_CAP,
  getDistributorPaymentPlan,
  normalizeBooleanFlag,
  getDistributorLedgerRows,
  handleDistributorLedgerCreate,
});

const { startWorkers, stopWorkers } = createBootstrapWorkers({
  startPhoneChangeWorker,
  startAppNotificationPurgeWorker,
  startCustomerRequestPurgeWorker,
  startPurchaseOperationsNotificationWorker,
  stopPhoneChangeWorker,
  stopAppNotificationPurgeWorker,
  stopCustomerRequestPurgeWorker,
  stopPurchaseOperationsNotificationWorker,
  env: process.env,
});

if (require.main === module) {
  startRuntime({
    app,
    port: PORT,
    isVercelRuntime: IS_VERCEL_RUNTIME,
    ensureRuntimeReady,
    startWorkers,
    stopWorkers,
    closePostgresScaffold,
  });
}

module.exports = app;

































