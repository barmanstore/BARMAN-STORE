import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PHONE_POLICY_MESSAGE = 'Phone number must be 10 digits (India format, optional +91 prefix).';
const PASSWORD_AUTH_DISABLED_ERROR = 'Password-based authentication is disabled. Use OTP or OAuth login.';

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
    },
  });

  let stdout = '';
  let stderr = '';
  server.stdout.on('data', (chunk) => { stdout += String(chunk); });
  server.stderr.on('data', (chunk) => { stderr += String(chunk); });

  const baseUrl = `http://127.0.0.1:${port}`;
  const request = async (pathname, init = {}, token = '') =>
    fetch(`${baseUrl}${pathname}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });

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

    const wrongOtpRes = await request('/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, otp: '000000' }),
    });
    const wrongOtpJson = await toJson(wrongOtpRes);
    assert.equal(wrongOtpRes.status, 400, `wrong OTP should fail: ${JSON.stringify(wrongOtpJson)}`);

    const otpVerifyRes = await request('/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, otp: otpRequestJson.dev_otp_code }),
    });
    const otpVerifyJson = await toJson(otpVerifyRes);
    assert.equal(otpVerifyRes.status, 200, `otp verify failed: ${JSON.stringify(otpVerifyJson)}`);
    assert.equal(Boolean(otpVerifyJson?.token), true, 'otp verify should return token');
    assert.equal(Boolean(otpVerifyJson?.user?.id), true, 'otp verify should return user');

    const userId = Number(otpVerifyJson.user.id || 0);
    const token = String(otpVerifyJson.token || '');
    assert.equal(userId > 0, true, 'user id should be positive');
    assert.equal(Boolean(token), true, 'auth token should be present');

    const invalidPhoneUpdateRes = await request(
      `/api/users/${userId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ phone: '1111' }),
      },
      token
    );
    const invalidPhoneUpdateJson = await toJson(invalidPhoneUpdateRes);
    assert.equal(invalidPhoneUpdateRes.status, 400, `invalid phone update should fail: ${JSON.stringify(invalidPhoneUpdateJson)}`);
    assert.equal(invalidPhoneUpdateJson?.error, PHONE_POLICY_MESSAGE);

    const firstRequestedPhone = randomIndianMobile();
    const firstPhoneUpdateRes = await request(
      `/api/users/${userId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ phone: `+91 ${firstRequestedPhone}` }),
      },
      token
    );
    const firstPhoneUpdateJson = await toJson(firstPhoneUpdateRes);
    assert.equal(firstPhoneUpdateRes.status, 200, `phone update request should succeed: ${JSON.stringify(firstPhoneUpdateJson)}`);
    assert.equal(firstPhoneUpdateJson?.phone, null, 'phone should remain unchanged until approval');
    assert.equal(firstPhoneUpdateJson?.phone_change_request?.status, 'PENDING_VALIDATION');
    assert.equal(firstPhoneUpdateJson?.phone_change_request?.new_phone, firstRequestedPhone);

    const requestStatusRes = await request('/api/auth/phone-change-request/status', { method: 'GET' }, token);
    const requestStatusJson = await toJson(requestStatusRes);
    assert.equal(requestStatusRes.status, 200, `phone change status fetch failed: ${JSON.stringify(requestStatusJson)}`);
    assert.equal(requestStatusJson?.request?.status, 'PENDING_VALIDATION');
    assert.equal(requestStatusJson?.request?.new_phone, firstRequestedPhone);

    const secondRequestedPhone = randomIndianMobile();
    const secondPhoneUpdateRes = await request(
      `/api/users/${userId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ phone: secondRequestedPhone }),
      },
      token
    );
    const secondPhoneUpdateJson = await toJson(secondPhoneUpdateRes);
    assert.equal(secondPhoneUpdateRes.status, 200, `second phone update request should succeed: ${JSON.stringify(secondPhoneUpdateJson)}`);
    assert.equal(secondPhoneUpdateJson?.phone_change_request?.status, 'PENDING_VALIDATION');
    assert.equal(secondPhoneUpdateJson?.phone_change_request?.new_phone, secondRequestedPhone);

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
