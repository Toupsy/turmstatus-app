const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'Turmstatus.html'), 'utf8');
const mapJs = fs.readFileSync(path.join(root, 'public', 'js', 'map.js'), 'utf8');

test('Kartenmarker haben gestaltete Turm- und Boot-Icons', () => {
  assert.match(html, /\.map-marker-shell/, 'shared marker shell CSS fehlt');
  assert.match(html, /\.tower-marker-pin/, 'Turm-Marker-CSS fehlt');
  assert.match(html, /\.boat-marker-pin/, 'Boot-Marker-CSS fehlt');
  assert.match(mapJs, /function _towerIcon\(status\)/, 'Turm-Icon-Factory fehlt');
  assert.match(mapJs, /function _boatIcon\(status\)/, 'Boot-Icon-Factory fehlt');
  assert.match(mapJs, /tower-marker-pin status-\$\{safeStatus\}/, 'Turmstatus muss als CSS-Klasse am Marker hängen');
  assert.match(mapJs, /boat-marker-pin status-\$\{safeStatus\}/, 'Bootstatus muss als CSS-Klasse am Marker hängen');
  assert.match(mapJs, /icon:\s*_boatIcon\(b\.status\)/, 'Boote sollen das gestaltete Boot-Icon nutzen');
  assert.match(mapJs, /icon:\s*_towerIcon\(t\.status\)/, 'Türme sollen das gestaltete Turm-Icon nutzen');
});
