// ============================================================
// http-common.test.js
// Regressionsschutz für Cloudflare-/Proxy-IP-Helper und gemeinsame HTTP-Handler.
// ============================================================

const test = require('node:test');
const assert = require('node:assert');

const {
  clientIpFromHeaders,
  compressIpv6,
  notFoundHandler,
  trustProxyValue,
} = require('../server/http-common');

function mockRes({ headersSent }) {
  const calls = { status: [], json: [] };
  const res = {
    headersSent,
    status(code) { calls.status.push(code); return res; },
    json(body) { calls.json.push(body); return res; },
  };
  return { res, calls };
}

test('notFoundHandler: sendet nichts mehr, wenn Header bereits raus sind', () => {
  const handler = notFoundHandler('admin-panel');
  const { res, calls } = mockRes({ headersSent: true });
  assert.doesNotThrow(() => handler({ url: '/x' }, res));
  assert.strictEqual(calls.status.length, 0, 'status() darf nicht aufgerufen werden');
  assert.strictEqual(calls.json.length, 0, 'json() darf nicht aufgerufen werden');
});

test('notFoundHandler: antwortet normal mit 404, wenn Header noch offen', () => {
  const handler = notFoundHandler('admin-panel');
  const { res, calls } = mockRes({ headersSent: false });
  handler({ url: '/fehlt' }, res);
  assert.deepStrictEqual(calls.status, [404]);
  assert.strictEqual(calls.json.length, 1);
  assert.strictEqual(calls.json[0].error, 'Not found');
  assert.strictEqual(calls.json[0].path, '/fehlt');
  assert.strictEqual(calls.json[0].service, 'admin-panel');
});

test('clientIpFromHeaders: bevorzugt Cloudflare vor X-Real-IP und X-Forwarded-For', () => {
  const req = {
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      'x-real-ip': '198.51.100.10',
      'x-forwarded-for': '192.0.2.1, 10.0.0.1',
    },
  };
  assert.strictEqual(clientIpFromHeaders(req), '203.0.113.10');
});

test('clientIpFromHeaders: nutzt X-Real-IP vor X-Forwarded-For', () => {
  const req = {
    headers: {
      'x-real-ip': '198.51.100.10',
      'x-forwarded-for': '192.0.2.1, 10.0.0.1',
    },
  };
  assert.strictEqual(clientIpFromHeaders(req), '198.51.100.10');
});

test('clientIpFromHeaders: nutzt die linkeste X-Forwarded-For-IP und entfernt IPv4-mapped Prefix', () => {
  const req = { headers: { 'x-forwarded-for': '::ffff:192.0.2.1, 10.0.0.1' } };
  assert.strictEqual(clientIpFromHeaders(req), '192.0.2.1');
});

test('compressIpv6: kanonisiert IPv6-Adressen', () => {
  assert.strictEqual(compressIpv6('2001:0db8:0000:0000:0000:0000:0000:0001'), '2001:db8::1');
  assert.strictEqual(compressIpv6('192.0.2.1'), '192.0.2.1');
});

test('trustProxyValue: parst TRUST_PROXY robust', () => {
  const old = process.env.TRUST_PROXY;
  try {
    delete process.env.TRUST_PROXY;
    assert.strictEqual(trustProxyValue(), 1);
    process.env.TRUST_PROXY = '2';
    assert.strictEqual(trustProxyValue(), 2);
    process.env.TRUST_PROXY = 'true';
    assert.strictEqual(trustProxyValue(), true);
    process.env.TRUST_PROXY = 'false';
    assert.strictEqual(trustProxyValue(), false);
    process.env.TRUST_PROXY = 'kaputt';
    assert.strictEqual(trustProxyValue(), 1);
  } finally {
    if (old === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = old;
  }
});
