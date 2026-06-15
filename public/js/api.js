// ============================================================
// api.js – Dünner Fetch-Wrapper (Session-Cookies, JSON)
// ============================================================

async function _req(method, url, body) {
  const opts = { method, credentials: 'include', headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* leere Antwort */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const apiGet = (url) => _req('GET', url);
const apiPost = (url, body) => _req('POST', url, body ?? {});
const apiPatch = (url, body) => _req('PATCH', url, body ?? {});
const apiDelete = (url) => _req('DELETE', url);
