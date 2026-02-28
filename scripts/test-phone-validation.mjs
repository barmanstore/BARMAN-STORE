import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PHONE_POLICY_MESSAGE = 'Phone number must be 10 digits (India format, optional +91 prefix).';
const PASSWORD_AUTH_DISABLED_ERROR = 'Password-based authentication is disabled. Use OTP or OAuth login.';
const CRON_SECRET = 'phone-change-cron-secret';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const main = async () => {
  const port = 5600 + Math.floor(Math.random() * 300);
  const server = spawn('node', ['server/index.js'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      AUTH_TOKEN_SECRET: 'test-secret-for-phone-validation',
      SUPABASE_AUTH_ENABLED: 'false',
      PHONE_CHANGE_AUTO_APPROVE_DELAY_MS: '1000',
      PHONE_CHANGE_ADMIN_REVIEW_WINDOW_DAYS: '0.00005',
      PHONE_CHANGE_CRON_ENABLED: 'true',
      PHONE_CHANGE_CRON_SECRET: CRON_SECRET,
    },
  });

  let stdout = '';
  let stderr = '';
  server.stdout.on('data', (chunk) => { stdout += String(chunk); });
  server.stderr.on('data', (chunk) => { stderr += String(chunk); });

  const baseUrl = `http://127.0.0.1:${port}`;
  const request = makeRequest(baseUrl);

  try {
    let ready = false;
    for (let i = 0; i < 120; i += 1) {
      try {
        const res = await request('/');
        if (res.ok) {
          ready = true;
          break;
        }
      } catch (_) {
        // keep polling
      }
      await delay(250);
    }
    assert.equal(ready, true, `Server did not start in time. stderr:\n${stderr}\nstdout:\n${stdout}`);

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
    assert.equal(Boolean(secondProcessRun?.result?.escalated_admin_review >= 1), true, 'second run should escalate conflict to admin review');

    const userTwoStatusRes = await userTwoRequest('/api/auth/phone-change-request/status', { method: 'GET' });
    const userTwoStatusJson = await toJson(userTwoStatusRes);
    assert.equal(userTwoStatusRes.status, 200, `user two status fetch failed: ${JSON.stringify(userTwoStatusJson)}`);
    const secondStatus = String(userTwoStatusJson?.request?.status || '').trim().toUpperCase();
    assert.equal(['PENDING_VALIDATION', 'REJECTED'].includes(secondStatus), true, 'status should be pending review or auto-rejected');
    if (secondStatus === 'PENDING_VALIDATION') {
      assert.equal(Boolean(userTwoStatusJson?.request?.needs_admin_review), true, 'request should require admin review');

      await delay(4000);
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
    server.kill('SIGTERM');
    await delay(300);
  }
};

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
