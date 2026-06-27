// ============================================================
// map.js – Einsatzkarte (Leaflet + OpenStreetMap)
// ============================================================

const TOWER_COLORS = { GREEN: '#3ec98a', YELLOW: '#ffb347', RED: '#ff5a4d' };

function initMap() {
  if (_map) return;
  // Fallback-Zentrum: DLRG Hauptwache Dahme (Strandpromenade), falls /api/config fehlt.
  const center = (appConfig && appConfig.map && appConfig.map.center) || [54.21449, 11.08967];
  const zoom = (appConfig && appConfig.map && appConfig.map.zoom) || 15;
  _map = L.map('map').setView(center, zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(_map);
  _markerLayer = L.layerGroup().addTo(_map);

  // Klick auf die Karte legt im "Turm setzen"-Modus einen Turm an dieser Position an.
  _map.on('click', (e) => {
    if (!_addTowerMode) return;
    setAddTowerMode(false);
    openTowerModal(null, e.latlng.lat, e.latlng.lng);
  });
}

// Farbiger Turm-Marker (für den Wachführer, da circleMarker nicht draggable ist).
function _towerIcon(status) {
  const color = TOWER_COLORS[status] || '#888';
  return L.divIcon({
    className: 'tower-marker',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};` +
          `border:2px solid #06131c;box-shadow:0 0 4px rgba(0,0,0,.6)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

// "Turm setzen"-Modus umschalten (Cursor + Toolbar-Hinweis).
function setAddTowerMode(on) {
  _addTowerMode = !!on;
  if (_map) _map.getContainer().style.cursor = _addTowerMode ? 'crosshair' : '';
  const btn = document.getElementById('btn-add-tower');
  if (btn) btn.classList.toggle('active', _addTowerMode);
  if (_addTowerMode) showToast('Auf die Karte klicken, um den Turm zu platzieren');
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

  // Türme: für den Wachführer als verschiebbare Marker (Positionieren), sonst als
  // farbcodierte Kreise (reine Anzeige).
  const canEditTowers = typeof isWachfuehrer === 'function' && isWachfuehrer();
  towers.forEach(t => {
    if (t.latitude == null || t.longitude == null) return;
    let popup =
      `<b>${escapeHtml(t.name)}</b> ${t.callSign ? '(' + escapeHtml(t.callSign) + ')' : ''}<br>` +
      `Status: ${escapeHtml(labelOf('towerStatus', t.status))}<br>` +
      `Besetzung: ${t.currentStaff}/${t.requiredStaff}`;
    if (canEditTowers) {
      popup += `<br><div style="margin-top:6px;display:flex;gap:6px">` +
        `<button onclick="openTowerById(${t.id})">Bearbeiten</button>` +
        `<button class="danger" onclick="deleteTower(${t.id})">Löschen</button></div>`;
      const marker = L.marker([t.latitude, t.longitude], { icon: _towerIcon(t.status), draggable: true });
      marker.on('dragend', (ev) => {
        const ll = ev.target.getLatLng();
        moveTower(t.id, ll.lat, ll.lng);
      });
      marker.bindPopup(popup).addTo(_markerLayer);
    } else {
      L.circleMarker([t.latitude, t.longitude], {
        radius: 11,
        color: TOWER_COLORS[t.status] || '#888',
        fillColor: TOWER_COLORS[t.status] || '#888',
        fillOpacity: 0.65,
        weight: 2
      }).bindPopup(popup).addTo(_markerLayer);
    }
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
