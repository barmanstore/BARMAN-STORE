import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PHONE_POLICY_MESSAGE = 'Phone number must be 10 digits (India format, optional +91 prefix).';
const TEST_PASSWORD = 'Aa1!aaaaaa';
const NEW_PASSWORD = 'Bb2@bbbbbb';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const randomIndianMobile = () => {
  const first = String(6 + Math.floor(Math.random() * 4));
  const rest = String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0');
  return `${first}${rest}`;
};

const toJson = async (res) => {
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
};

const main = async () => {
  const port = 5600 + Math.floor(Math.random() * 300);
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'barman-phone-test-'));
  const dbPath = path.join(tempRoot, 'test.db');
  const backupDir = path.join(tempRoot, 'backups');
  const uploadsDir = path.join(tempRoot, 'uploads');

  const server = spawn('node', ['server/index.js'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DB_PATH: dbPath,
      BACKUP_DIR: backupDir,
      UPLOADS_DIR: uploadsDir,
      AUTH_TOKEN_SECRET: 'test-secret-for-phone-validation',
    },
  });

  let stdout = '';
  let stderr = '';
  server.stdout.on('data', (chunk) => { stdout += String(chunk); });
  server.stderr.on('data', (chunk) => { stderr += String(chunk); });

  const baseUrl = `http://127.0.0.1:${port}`;
  const request = async (pathname, init = {}) =>
    fetch(`${baseUrl}${pathname}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

  try {
    let ready = false;
    for (let i = 0; i < 50; i += 1) {
      try {
        const res = await request('/');
        if (res.ok) {
          ready = true;
          break;
        }
      } catch (_) {
        // keep polling
      }
      await delay(150);
    }
    assert.equal(ready, true, `Server did not start in time. stderr:\n${stderr}\nstdout:\n${stdout}`);

    const mobile = randomIndianMobile();
    const registerPhoneRaw = `+91 ${mobile}`;

    const registerRes = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: null,
        phone: registerPhoneRaw,
        password: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
        name: 'Phone Test User',
        address: 'Test Address',
      }),
    });
    const registerJson = await toJson(registerRes);
    assert.equal(registerRes.status, 201, `register failed: ${JSON.stringify(registerJson)}`);
    assert.equal(registerJson?.user?.phone, mobile, 'registered phone should be normalized to 10-digit local number');

    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone: `0${mobile}`, password: TEST_PASSWORD }),
    });
    const loginJson = await toJson(loginRes);
    assert.equal(loginRes.status, 200, `login with normalized phone failed: ${JSON.stringify(loginJson)}`);
    assert.equal(Boolean(loginJson?.token), true, 'login should return token');

    const badRegisterRes = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: null,
        phone: '12345',
        password: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
        name: 'Bad Phone User',
      }),
    });
    const badRegisterJson = await toJson(badRegisterRes);
    assert.equal(badRegisterRes.status, 400, 'register with invalid phone should fail');
    assert.equal(badRegisterJson?.error, PHONE_POLICY_MESSAGE, 'invalid register phone should return policy message');

    const badLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone: 'abc123', password: TEST_PASSWORD }),
    });
    const badLoginJson = await toJson(badLoginRes);
    assert.equal(badLoginRes.status, 400, 'login with invalid phone should fail');
    assert.equal(badLoginJson?.error, PHONE_POLICY_MESSAGE, 'invalid login phone should return policy message');

    const resetBadRes = await request('/api/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: null, phone: '1111', reason: 'test' }),
    });
    const resetBadJson = await toJson(resetBadRes);
    assert.equal(resetBadRes.status, 400, 'reset request with invalid phone should fail');
    assert.equal(resetBadJson?.error, PHONE_POLICY_MESSAGE, 'invalid reset phone should return policy message');

    const changeRes = await request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        email: null,
        phone: `0091-${mobile}`,
        currentPassword: TEST_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }),
    });
    const changeJson = await toJson(changeRes);
    assert.equal(changeRes.status, 200, `change-password with normalized India phone should pass: ${JSON.stringify(changeJson)}`);

    const loginNewPassRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone: mobile, password: NEW_PASSWORD }),
    });
    const loginNewPassJson = await toJson(loginNewPassRes);
    assert.equal(loginNewPassRes.status, 200, `login with new password failed: ${JSON.stringify(loginNewPassJson)}`);

    console.log('Phone validation integration tests passed.');
  } finally {
    server.kill('SIGTERM');
    await delay(250);
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
