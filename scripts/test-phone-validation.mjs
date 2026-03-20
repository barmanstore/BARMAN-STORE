import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  logSmokeSkipInfo,
  parseBooleanEnv,
  resolveSmokeDbConfig,
  withResolvedSmokeDbEnv,
} from './smokeDbConfig.mjs';

const PHONE_POLICY_MESSAGE = 'Phone number must be 10 digits (India format, optional +91 prefix).';
const PASSWORD_AUTH_DISABLED_ERROR = 'Password-based authentication is disabled. Use OTP or OAuth login.';
const CRON_SECRET = 'phone-change-cron-secret';
const allowSkipIfNoDb = parseBooleanEnv(String(
  process.env.PHONE_TEST_ALLOW_NO_DB || process.env.SMOKE_ALLOW_NO_DB || ''
), false);
const smokeDbConfig = resolveSmokeDbConfig({
  testName: 'Phone workflow smoke test',
  explicitEnvKeys: ['PHONE_TEST_DB_URL', 'SMOKE_TEST_DB_URL'],
});
const hasDbEnv = Boolean(smokeDbConfig.dbUrl);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const terminateServer = async (server, timeoutMs = 2000) => {
  if (!server) return;
  if (typeof server.close === 'function') {
    await Promise.race([
      new Promise((resolve) => {
        try {
          server.close(() => resolve(true));
        } catch (_) {
          resolve(true);
        }
      }),
      delay(timeoutMs),
    ]);
    return;
  }
  if (server.killed) return;
  const exited = new Promise((resolve) => {
    server.once('exit', () => resolve(true));
  });
  try {
    server.kill('SIGTERM');
  } catch (_) {
    // ignore kill errors
  }
  const timedOut = await Promise.race([exited.then(() => false), delay(timeoutMs).then(() => true)]);
  if (timedOut && !server.killed) {
    try {
      server.kill('SIGKILL');
    } catch (_) {
      // ignore hard kill errors
    }
    await Promise.race([exited, delay(800)]);
  }
};

const randomIndianMobile = () => {
  const first = String(6 + Math.floor(Math.random() * 4));
  const rest = String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0');
  return `${first}${rest}`;
};

const randomEmail = () => `phone-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

const toJson = async (res) => {
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
};

const makeRequest = (baseUrl, token = '') => async (pathname, init = {}, extraHeaders = {}) =>
  fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
      ...(init.headers || {}),
    },
  });

const registerOtpUser = async (request) => {
  const email = randomEmail();
  const otpRequestRes = await request('/api/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'register',
      email,
    }),
  });
  const otpRequestJson = await toJson(otpRequestRes);
  assert.equal(otpRequestRes.status, 201, `otp request failed: ${JSON.stringify(otpRequestJson)}`);
  assert.equal(Boolean(otpRequestJson?.dev_otp_code), true, 'otp response should expose dev_otp_code in test mode');

  const otpVerifyRes = await request('/api/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ email, otp: otpRequestJson.dev_otp_code }),
  });
  const otpVerifyJson = await toJson(otpVerifyRes);
  assert.equal(otpVerifyRes.status, 200, `otp verify failed: ${JSON.stringify(otpVerifyJson)}`);
  assert.equal(Boolean(otpVerifyJson?.token), true, 'otp verify should return token');
  assert.equal(Boolean(otpVerifyJson?.user?.id), true, 'otp verify should return user');
  return {
    email,
    userId: Number(otpVerifyJson.user.id || 0),
    token: String(otpVerifyJson.token || ''),
  };
};

const runInternalProcessor = async (request) => {
  const res = await request(
    '/api/internal/phone-change/process',
    { method: 'POST', body: JSON.stringify({ limit: 50 }) },
    { Authorization: `Bearer ${CRON_SECRET}` }
  );
  const json = await toJson(res);
  assert.equal(res.status, 200, `internal processor failed: ${JSON.stringify(json)}`);
  return json;
};

const buildTestEnv = (port) => ({
  NODE_ENV: 'test',
  PORT: String(port),
  AUTH_TOKEN_SECRET: 'test-secret-for-phone-validation',
  SUPABASE_AUTH_ENABLED: 'false',
  AUTH_LOGIN_OTP_EXPOSE_CODE: 'true',
  PHONE_CHANGE_AUTO_APPROVE_DELAY_MS: '1000',
  PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS: '0.00005',
  PHONE_CHANGE_PROCESS_INTERVAL_MS: '60000',
  PHONE_CHANGE_CRON_ENABLED: 'true',
  PHONE_CHANGE_CRON_SECRET: CRON_SECRET,
  ...withResolvedSmokeDbEnv({}, smokeDbConfig.dbUrl),
});

let inProcessApp = null;
const loadInProcessApp = async () => {
  if (inProcessApp) return inProcessApp;
  const moduleUrl = new URL('../server/index.js', import.meta.url);
  const imported = await import(moduleUrl);
  inProcessApp = imported.default || imported.app || imported;
  return inProcessApp;
};

const startInProcessServer = async (port) => {
  Object.assign(process.env, buildTestEnv(port));
  const app = await loadInProcessApp();
  const server = app.listen(port, '127.0.0.1');
  return {
    server,
    app,
    readLogs: () => ({ stdout: '', stderr: '[INFO] In-process server started.' }),
  };
};

const spawnPhoneTestServer = async (port) => {
  let stdout = '';
  let stderr = '';
  try {
    const server = spawn(process.execPath, ['server/index.js'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...buildTestEnv(port),
      },
    });

    server.stdout.on('data', (chunk) => { stdout += String(chunk); });
    server.stderr.on('data', (chunk) => { stderr += String(chunk); });

    return {
      server,
      app: null,
      readLogs: () => ({ stdout, stderr }),
    };
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
    stderr = `${stderr}\n[WARN] spawn EPERM. Falling back to in-process server.`;
    const boot = await startInProcessServer(port);
    return {
      ...boot,
      readLogs: () => ({ stdout, stderr }),
    };
  }
};

const waitForServerReady = async (request, attempts = 220, waitMs = 250) => {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await request('/');
      if (res.ok) return true;
    } catch (_) {
      // keep polling
    }
    await delay(waitMs);
  }
  return false;
};

const main = async () => {
  const bootAttempts = 3;
  let server = null;
  let appInstance = null;
  let request = null;
  let baseUrl = '';
  let bootDiagnostics = '';

  try {
    if (smokeDbConfig.shouldSkip) {
      logSmokeSkipInfo(smokeDbConfig.reason);
      return;
    }
    if (!hasDbEnv && !allowSkipIfNoDb) {
      throw new Error(
        'Phone workflow smoke test requires a dedicated smoke-test database. Set PHONE_TEST_DB_URL or SMOKE_TEST_DB_URL, or use PHONE_TEST_ALLOW_NO_DB=1 to skip.'
      );
    }
    if (allowSkipIfNoDb && !hasDbEnv) {
      logSmokeSkipInfo(
        'Phone workflow smoke test skipped because no dedicated smoke-test database is configured.',
        ['Set PHONE_TEST_DB_URL or SMOKE_TEST_DB_URL to run the test safely.']
      );
      return;
    }

    let ready = false;
    for (let attempt = 1; attempt <= bootAttempts; attempt += 1) {
      const port = 5600 + Math.floor(Math.random() * 300);
      const boot = await spawnPhoneTestServer(port);
      server = boot.server;
      appInstance = boot.app || null;
      baseUrl = `http://127.0.0.1:${port}`;
      request = makeRequest(baseUrl);
      ready = await waitForServerReady(request);
      if (ready) break;

      const logs = boot.readLogs();
      bootDiagnostics += `\n[attempt ${attempt}] stderr:\n${logs.stderr}\nstdout:\n${logs.stdout}\n`;
      await terminateServer(server);
      if (appInstance?.closeRuntime) {
        await appInstance.closeRuntime().catch(() => {});
      }
      await delay(400);

      if (attempt < bootAttempts) {
        await delay(1200 * attempt);
      }
    }
    if (!ready) {
      const dbBootFailed = /Database initialization failed|Postgres\/Supabase initialization failed|ECONNREFUSED/i.test(bootDiagnostics);
      if (allowSkipIfNoDb && dbBootFailed) {
        logSmokeSkipInfo(
          'Phone workflow smoke test skipped because the database is unavailable.',
          ['Set PHONE_TEST_DB_URL or SMOKE_TEST_DB_URL to run the test safely.']
        );
        return;
      }
      assert.equal(
        ready,
        true,
        `Server did not start in time after ${bootAttempts} attempts.${bootDiagnostics}`
      );
    }

    const disabledRegisterRes = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: randomEmail(),
        password: 'Aa1!aaaaaa',
      }),
    });
    const disabledRegisterJson = await toJson(disabledRegisterRes);
    assert.equal(disabledRegisterRes.status, 410, `register expected 410: ${JSON.stringify(disabledRegisterJson)}`);
    assert.equal(disabledRegisterJson?.error, PASSWORD_AUTH_DISABLED_ERROR);

    const badOtpRequestRes = await request('/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone: '12345' }),
    });
    const badOtpRequestJson = await toJson(badOtpRequestRes);
    assert.equal(badOtpRequestRes.status, 400, `invalid phone otp request should fail: ${JSON.stringify(badOtpRequestJson)}`);
    assert.equal(badOtpRequestJson?.error, PHONE_POLICY_MESSAGE);

    const userOne = await registerOtpUser(request);
    assert.equal(userOne.userId > 0, true, 'user one id should be positive');
    assert.equal(Boolean(userOne.token), true, 'user one token should be present');
    const userOneRequest = makeRequest(baseUrl, userOne.token);

    const invalidPhoneUpdateRes = await userOneRequest(`/api/users/${userOne.userId}`, {
      method: 'PUT',
      body: JSON.stringify({ phone: '1111' }),
    });
    const invalidPhoneUpdateJson = await toJson(invalidPhoneUpdateRes);
    assert.equal(invalidPhoneUpdateRes.status, 400, `invalid phone update should fail: ${JSON.stringify(invalidPhoneUpdateJson)}`);
    assert.equal(invalidPhoneUpdateJson?.error, PHONE_POLICY_MESSAGE);

    const sharedPhone = randomIndianMobile();
    const firstPhoneUpdateRes = await userOneRequest(`/api/users/${userOne.userId}`, {
      method: 'PUT',
      body: JSON.stringify({ phone: `+91 ${sharedPhone}` }),
    });
    const firstPhoneUpdateJson = await toJson(firstPhoneUpdateRes);
    assert.equal(firstPhoneUpdateRes.status, 200, `phone update request should succeed: ${JSON.stringify(firstPhoneUpdateJson)}`);
    assert.equal(firstPhoneUpdateJson?.phone, null, 'phone should remain unchanged until approval');
    assert.equal(firstPhoneUpdateJson?.phone_change_request?.status, 'PENDING_VALIDATION');
    assert.equal(firstPhoneUpdateJson?.phone_change_request?.new_phone, sharedPhone);

    const unauthorizedCronRes = await request('/api/internal/phone-change/process', { method: 'POST' });
    const unauthorizedCronJson = await toJson(unauthorizedCronRes);
    assert.equal(unauthorizedCronRes.status, 401, `internal processor should require secret: ${JSON.stringify(unauthorizedCronJson)}`);

    await delay(1400);
    const firstProcessRun = await runInternalProcessor(request);
    assert.equal(Boolean(firstProcessRun?.result), true, 'processor should return stats');

    const userOneProfileRes = await userOneRequest(`/api/users/${userOne.userId}`, { method: 'GET' });
    const userOneProfileJson = await toJson(userOneProfileRes);
    assert.equal(userOneProfileRes.status, 200, `user one profile fetch failed: ${JSON.stringify(userOneProfileJson)}`);
    assert.equal(userOneProfileJson?.phone, sharedPhone, 'user one phone should be auto-approved');

    const userTwo = await registerOtpUser(request);
    const userTwoRequest = makeRequest(baseUrl, userTwo.token);
    const userTwoPhoneUpdateRes = await userTwoRequest(`/api/users/${userTwo.userId}`, {
      method: 'PUT',
      body: JSON.stringify({ phone: sharedPhone }),
    });
    const userTwoPhoneUpdateJson = await toJson(userTwoPhoneUpdateRes);
    assert.equal(userTwoPhoneUpdateRes.status, 200, `second user phone update should queue: ${JSON.stringify(userTwoPhoneUpdateJson)}`);
    assert.equal(userTwoPhoneUpdateJson?.phone_change_request?.status, 'PENDING_VALIDATION');

    await delay(1400);
    const secondProcessRun = await runInternalProcessor(request);
    const secondEscalations = Number(secondProcessRun?.result?.escalated_admin_review || 0);

    const userTwoStatusRes = await userTwoRequest('/api/auth/phone-change-request/status', { method: 'GET' });
    const userTwoStatusJson = await toJson(userTwoStatusRes);
    assert.equal(userTwoStatusRes.status, 200, `user two status fetch failed: ${JSON.stringify(userTwoStatusJson)}`);
    const secondStatus = String(userTwoStatusJson?.request?.status || '').trim().toUpperCase();
    const secondNeedsReview = Boolean(userTwoStatusJson?.request?.needs_admin_review);
    assert.equal(
      Boolean(secondEscalations >= 1 || secondNeedsReview || secondStatus === 'REJECTED'),
      true,
      `second run should escalate conflict to admin review (or already be escalated/rejected): ${JSON.stringify(secondProcessRun)}`
    );
    assert.equal(['PENDING_VALIDATION', 'REJECTED'].includes(secondStatus), true, 'status should be pending review or auto-rejected');
    if (secondStatus === 'PENDING_VALIDATION') {
      assert.equal(secondNeedsReview, true, 'request should require admin review');

      await delay(6500);
      const thirdProcessRun = await runInternalProcessor(request);
      assert.equal(Boolean(thirdProcessRun?.result?.expired_rejected >= 1), true, 'third run should auto-reject overdue admin review');

      const userTwoExpiredStatusRes = await userTwoRequest('/api/auth/phone-change-request/status', { method: 'GET' });
      const userTwoExpiredStatusJson = await toJson(userTwoExpiredStatusRes);
      assert.equal(userTwoExpiredStatusRes.status, 200, `user two expired status fetch failed: ${JSON.stringify(userTwoExpiredStatusJson)}`);
      assert.equal(userTwoExpiredStatusJson?.request?.status, 'REJECTED');
      assert.equal(
        String(userTwoExpiredStatusJson?.request?.rejection_reason || '').toLowerCase().includes('expired'),
        true,
        'rejection reason should indicate expiry'
      );
    } else {
      assert.equal(
        String(userTwoStatusJson?.request?.rejection_reason || '').toLowerCase().includes('expired'),
        true,
        'immediate rejection should indicate expiry'
      );
    }

    const secondRequestedPhone = randomIndianMobile();
    const secondRequestRes = await userTwoRequest(`/api/users/${userTwo.userId}`, {
      method: 'PUT',
      body: JSON.stringify({ phone: secondRequestedPhone }),
    });
    const secondRequestJson = await toJson(secondRequestRes);
    assert.equal(secondRequestRes.status, 200, `second pending request should succeed: ${JSON.stringify(secondRequestJson)}`);
    assert.equal(secondRequestJson?.phone_change_request?.status, 'PENDING_VALIDATION');
    assert.equal(secondRequestJson?.phone_change_request?.new_phone, secondRequestedPhone);

    const cancelRes = await userTwoRequest('/api/auth/phone-change-request/cancel', { method: 'POST' });
    const cancelJson = await toJson(cancelRes);
    assert.equal(cancelRes.status, 200, `cancel request failed: ${JSON.stringify(cancelJson)}`);
    assert.equal(cancelJson?.request?.status, 'REJECTED');
    assert.equal(
      String(cancelJson?.request?.rejection_reason || '').toLowerCase().includes('cancelled'),
      true,
      'cancel request should mark rejection reason'
    );

    console.log('Phone update workflow smoke test passed.');
  } finally {
    if (server) {
      await terminateServer(server);
      if (appInstance?.closeRuntime) {
        await appInstance.closeRuntime().catch(() => {});
      }
    }
  }
};

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
