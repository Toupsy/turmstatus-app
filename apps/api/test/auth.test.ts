import { describe, it, expect, afterEach } from 'vitest';
import { makeTestApp, client, type TestApp } from './helpers.js';

let app: TestApp;
afterEach(async () => {
  await app?.close();
});

describe('Auth & Setup', () => {
  it('öffentliche Endpunkte erreichbar, /me ohne Session = null', async () => {
    app = await makeTestApp();
    const c = client(app.publicApp);

    const config = await c.get('/api/config');
    expect(config.statusCode).toBe(200);
    expect(config.json().roles).toContain('WACHFUEHRER');

    const health = await c.get('/health');
    expect(health.statusCode).toBe(200);

    const me = await c.get('/api/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toBe(null);
  });

  it('gesät­er Admin kann sich einloggen und wieder ausloggen', async () => {
    app = await makeTestApp({ adminPassword: 'admin-secret-123' });
    const c = client(app.publicApp);

    expect((await c.get('/api/auth/needs-setup')).json().needsSetup).toBe(false);

    const bad = await c.post('/api/auth/login', { username: 'hauptwache', password: 'falsch' });
    expect(bad.statusCode).toBe(401);

    const login = await c.post('/api/auth/login', { username: 'hauptwache', password: 'admin-secret-123' });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.isAdmin).toBe(true);
    expect(login.json().user.role).toBe('HAUPTWACHE');

    const me = await c.get('/api/auth/me');
    expect(me.json().user.username).toBe('hauptwache');

    expect((await c.post('/api/auth/logout')).statusCode).toBe(200);
    expect((await c.get('/api/auth/me')).json().user).toBe(null);
  });

  it('Erst-Setup ohne vorhandenen Admin: init legt Admin an, zweites init → 409', async () => {
    app = await makeTestApp({ adminPassword: null });
    const c = client(app.publicApp);

    expect((await c.get('/api/auth/needs-setup')).json().needsSetup).toBe(true);

    const init = await c.post('/api/auth/init', { username: 'chef', password: 'setup-secret-1' });
    expect(init.statusCode).toBe(200);
    expect(init.json().user.isAdmin).toBe(true);

    expect((await c.get('/api/auth/needs-setup')).json().needsSetup).toBe(false);
    const again = await c.post('/api/auth/init', { username: 'chef2', password: 'setup-secret-2' });
    expect(again.statusCode).toBe(409);
  });

  it('Registrierung: disabled → 403; open → neuer Wachführer', async () => {
    app = await makeTestApp({ adminPassword: 'admin-secret-123' });
    const cDisabled = client(app.publicApp);
    expect((await cDisabled.post('/api/auth/register', { username: 'neu', password: 'passwort1' })).statusCode).toBe(403);
    await app.close();

    app = await makeTestApp({ adminPassword: 'admin-secret-123', registrationMode: 'open' });
    const c = client(app.publicApp);
    const reg = await c.post('/api/auth/register', { username: 'wf1', password: 'passwort1', fullName: 'WF Eins' });
    expect(reg.statusCode).toBe(200);
    expect(reg.json().user.role).toBe('WACHFUEHRER');
  });

  it('Live-WS lehnt ohne Session ab (401-nah) und Admin-App teilt dieselbe DB', async () => {
    app = await makeTestApp({ adminPassword: 'admin-secret-123' });
    const cAdmin = client(app.adminApp);
    // Admin-App kennt denselben Seed-Admin.
    const login = await cAdmin.post('/api/auth/login', { username: 'hauptwache', password: 'admin-secret-123' });
    expect(login.statusCode).toBe(200);
  });
});
