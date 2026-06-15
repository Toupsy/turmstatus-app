// ============================================================
// map.js – Einsatzkarte (Leaflet + OpenStreetMap)
// ============================================================

const TOWER_COLORS = { GREEN: '#3ec98a', YELLOW: '#ffb347', RED: '#ff5a4d' };

function initMap() {
  if (_map) return;
  const center = (appConfig && appConfig.map && appConfig.map.center) || [54.0203, 13.7748];
  const zoom = (appConfig && appConfig.map && appConfig.map.zoom) || 14;
  _map = L.map('map').setView(center, zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(_map);
  _markerLayer = L.layerGroup().addTo(_map);
}

function _emojiIcon(emoji) {
  return L.divIcon({
    className: 'emoji-marker',
    html: `<div style="font-size:20px;line-height:1;text-shadow:0 0 3px #000">${emoji}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

function renderMap() {
  if (!_map) return;
  _markerLayer.clearLayers();

  // Türme (farbcodierte Kreise)
  towers.forEach(t => {
    if (t.latitude == null || t.longitude == null) return;
    L.circleMarker([t.latitude, t.longitude], {
      radius: 11,
      color: TOWER_COLORS[t.status] || '#888',
      fillColor: TOWER_COLORS[t.status] || '#888',
      fillOpacity: 0.65,
      weight: 2
    }).bindPopup(
      `<b>${escapeHtml(t.name)}</b> ${t.callSign ? '(' + escapeHtml(t.callSign) + ')' : ''}<br>` +
      `Status: ${escapeHtml(labelOf('towerStatus', t.status))}<br>` +
      `Besetzung: ${t.currentStaff}/${t.requiredStaff}`
    ).addTo(_markerLayer);
  });

  // Wachgänger
  guards.forEach(g => {
    if (g.latitude == null || g.longitude == null) return;
    L.marker([g.latitude, g.longitude], { icon: _emojiIcon('🚩') })
      .bindPopup(`<b>🚩 ${escapeHtml(g.name)}</b><br>${escapeHtml(labelOf('guardStatus', g.status))}` +
        (g.towerName ? `<br>Turm: ${escapeHtml(g.towerName)}` : ''))
      .addTo(_markerLayer);
  });

  // Boote
  boats.forEach(b => {
    if (b.latitude == null || b.longitude == null) return;
    L.marker([b.latitude, b.longitude], { icon: _emojiIcon('⛵') })
      .bindPopup(`<b>⛵ ${escapeHtml(b.name)}</b> ${b.callSign ? '(' + escapeHtml(b.callSign) + ')' : ''}<br>` +
        escapeHtml(labelOf('boatStatus', b.status)))
      .addTo(_markerLayer);
  });
}
