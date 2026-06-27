const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'Turmstatus.html'), 'utf8');
const mapJs = fs.readFileSync(path.join(root, 'public', 'js', 'map.js'), 'utf8');
const viewsJs = fs.readFileSync(path.join(root, 'public', 'js', 'views.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'server', 'config.json'), 'utf8'));

test('Kartenmarker haben gestaltete Turm- und Boot-Icons', () => {
  assert.match(html, /\.map-marker-shell/, 'shared marker shell CSS fehlt');
  assert.match(html, /\.tower-marker-pin/, 'Turm-Marker-CSS fehlt');
  assert.match(html, /\.boat-marker-pin/, 'Boot-Marker-CSS fehlt');
  assert.match(mapJs, /function _towerIcon\(status, hasBoat\)/, 'Turm-Icon-Factory mit Boot-Variante fehlt');
  assert.match(mapJs, /function _boatIcon\(status\)/, 'Boot-Icon-Factory fehlt');
  assert.match(mapJs, /tower-marker-pin status-\$\{safeStatus\}/, 'Turmstatus muss als CSS-Klasse am Marker hängen');
  assert.match(mapJs, /boat-marker-pin status-\$\{safeStatus\}/, 'Bootstatus muss als CSS-Klasse am Marker hängen');
  assert.match(mapJs, /icon:\s*_boatIcon\(b\.status\)/, 'Boote sollen das gestaltete Boot-Icon nutzen');
  assert.match(mapJs, /_towerHasBoat\(t\.id\)/, 'Türme müssen prüfen, ob ein Boot zugeordnet ist');
  assert.match(html, /\.tower-marker\.has-boat/, 'Turm-mit-Boot-CSS fehlt');
  assert.match(mapJs, /map-marker-boat-badge/, 'Turm-mit-Boot-Badge fehlt');
});

test('Kartenrendering wird gebündelt statt bei jedem Datenrefresh sofort neu gebaut', () => {
  assert.match(mapJs, /function scheduleRenderMap\(\)/, 'Debounced Render-Scheduler fehlt');
  assert.match(mapJs, /requestAnimationFrame/, 'Kartenrendering soll per Animation-Frame gebündelt werden');
  assert.doesNotMatch(viewsJs, /refreshTowers\(\)[\s\S]*renderMap\(\)/, 'refreshTowers soll nicht direkt renderMap aufrufen');
  assert.doesNotMatch(viewsJs, /refreshGuards\(\)[\s\S]*renderMap\(\)/, 'refreshGuards soll nicht direkt renderMap aufrufen');
  assert.doesNotMatch(viewsJs, /refreshBoats\(\)[\s\S]*renderMap\(\)/, 'refreshBoats soll nicht direkt renderMap aufrufen');
  assert.match(viewsJs, /scheduleRenderMap\(\);/, 'refreshAll soll Kartenrendering einmalig bündeln');
});

test('Karte ist auf Schleswig-Holstein begrenzt', () => {
  assert.deepStrictEqual(config.map.bounds, [[53.3, 7.2], [55.2, 11.4]], 'Schleswig-Holstein-Bounds fehlen in der Config');
  assert.ok(config.map.minZoom >= 7, 'minZoom soll Herauszoomen auf Welt-/Deutschlandkarte verhindern');
  assert.match(mapJs, /maxBounds/, 'Leaflet-Map muss maxBounds setzen');
  assert.match(mapJs, /maxBoundsViscosity\s*=\s*1|maxBoundsViscosity:\s*1/, 'Map soll beim Rand hart begrenzt sein');
  assert.match(mapJs, /noWrap:\s*true/, 'Tile-Layer soll Weltkopien nicht wiederholen');
  assert.match(mapJs, /bounds:\s*mapBounds/, 'Tile-Layer soll nur im konfigurierten Bereich Tiles laden');
});
