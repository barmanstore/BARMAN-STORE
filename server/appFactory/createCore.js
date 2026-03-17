const express = require('express');
const cors = require('cors');
const { AsyncLocalStorage } = require('async_hooks');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const XLSX = require('xlsx');
const { parseBooleanEnv } = require('../core/envUtils');
const { createBootstrapConfig } = require('../core/bootstrap/config');
const { applyHttpBootstrap } = require('../core/bootstrap/http');
const { createBootstrapProviders } = require('../core/bootstrap/providers');
const { createBootstrapDatabase } = require('../core/bootstrap/db');
const { createProfileImageSupport } = require('../core/bootstrap/profileImages');
const { createRequestUtils } = require('../core/requestUtils');
const { createRateLimiter } = require('../core/rateLimiter');
const { createAdminAuditLogger } = require('../core/adminAudit');
const { isUniqueViolationError } = require('../core/dbUtils');
const {
  SQL_INSERT_IGNORE_CATEGORY,
  SQL_UPSERT_VISITOR_SESSION,
  SQL_UPSERT_IMPORT_BATCH,
  SQL_CAST_TO_INT,
} = require('../core/sqlConstants');
const {
  createPostgresPool,
  getPostgresConnectionLabel,
  pingPostgresPool,
} = require('../db/postgresScaffold');
const { normalizeExecutionMode } = require('../db/executionAdapter');
const { createQueryAdapter } = require('../db/queryAdapter');
const {
  applyPostgresMigrations,
  ensurePostgresBootstrapData,
} = require('../db/postgresBootstrap');
const { createAuthSupport, createProfileImageUtils, createProfileImageStorage } = require('../features/auth');
const { createValidateCustomerProfile } = require('../utils/customerValidation');
const { createProductHelpers } = require('../utils/productUtils');
const { generateSku } = require('../utils/skuUtils');

const createCore = () => {
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
  const configValues = { ...config };

  const {
    otpProvider,
    emailVerificationProvider,
    whatsappProvider,
    notificationService,
    supabaseAuthProvider,
  } = createBootstrapProviders({ config, env: process.env });
  const authSupport = createAuthSupport({
    bcrypt,
    crypto,
    saltRounds: config.SALT_ROUNDS,
    authTokenSecret: config.AUTH_TOKEN_SECRET,
    tokenTtlMs: config.TOKEN_TTL_MS,
  });
  const validateCustomerProfile = createValidateCustomerProfile(authSupport.normalizePhone);
  const requestUtils = createRequestUtils({ crypto });

  const db = createBootstrapDatabase({
    config,
    AsyncLocalStorage,
    createPostgresPool,
    pingPostgresPool,
    getPostgresConnectionLabel,
    applyPostgresMigrations,
    ensurePostgresBootstrapData,
    createQueryAdapter,
    normalizeEmail: authSupport.normalizeEmail,
    isStrongPassword: authSupport.isStrongPassword,
    hashPassword: authSupport.hashPassword,
    generateSku,
  });
  app.closeRuntime = db.closePostgresScaffold;

  const profileImages = createProfileImageSupport({
    env: process.env,
    fs,
    path,
    createProfileImageUtils,
    createProfileImageStorage,
    profileUploadDir: config.PROFILE_UPLOAD_DIR,
  });

  const http = applyHttpBootstrap({
    app,
    express,
    cors,
    corsOptions: config.corsOptions,
    fs,
    UPLOADS_DIR: config.UPLOADS_DIR,
    PROFILE_UPLOAD_DIR: config.PROFILE_UPLOAD_DIR,
    IS_VERCEL_RUNTIME: config.IS_VERCEL_RUNTIME,
    CANONICAL_HOST: config.CANONICAL_HOST,
    LEGACY_HOSTS: config.LEGACY_HOSTS,
    profileImagePublicBaseUrl: profileImages.profileImagePublicBaseUrl,
    ensureRuntimeReady: db.ensureRuntimeReady,
    createRateLimiter,
  });
  const adminAudit = createAdminAuditLogger({
    dbRunAsync: db.dbRunAsync,
    safeSerializeJson: requestUtils.safeSerializeJson,
    getRequestIp: requestUtils.getRequestIp,
  });

  const productHelpers = createProductHelpers({
    dbAllAsync: db.dbAllAsync,
    dbGetAsync: db.dbGetAsync,
    dbRunAsync: db.dbRunAsync,
    dbTxAsync: db.dbTxAsync,
    XLSX,
    crypto,
    path,
    SQL_INSERT_IGNORE_CATEGORY,
  });

  return {
    app,
    config,
    configValues,
    providers: {
      otpProvider,
      emailVerificationProvider,
      whatsappProvider,
      notificationService,
      supabaseAuthProvider,
    },
    authSupport,
    validateCustomerProfile,
    requestUtils,
    db,
    profileImages,
    http,
    adminAudit,
    productHelpers,
    constants: {
      SQL_INSERT_IGNORE_CATEGORY,
      SQL_UPSERT_VISITOR_SESSION,
      SQL_UPSERT_IMPORT_BATCH,
      SQL_CAST_TO_INT,
      isUniqueViolationError,
      parseBooleanEnv,
    },
    libs: {
      crypto,
      path,
      fs,
      XLSX,
    },
  };
};

module.exports = { createCore };
