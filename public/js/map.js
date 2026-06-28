// ============================================================
// map.js – Einsatzkarte (Leaflet + OpenStreetMap)
// ============================================================

const TOWER_COLORS = { GREEN: '#3ec98a', YELLOW: '#ffb347', RED: '#ff5a4d' };

function _mapConfig() {
  return (appConfig && appConfig.map) || {};
}

function _configuredMapBounds() {
  const bounds = _mapConfig().bounds;
  if (!Array.isArray(bounds) || bounds.length !== 2) return null;
  return L.latLngBounds(bounds[0], bounds[1]);
}

// Versetzt eine Position um `distanceM` Meter in Richtung `bearingDeg` (Grad im
// Uhrzeigersinn von Nord; 90 = Osten). Equirectangulare Näherung – für wenige
// hundert Meter völlig ausreichend.
function _offsetLatLng(lat, lng, distanceM, bearingDeg) {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (distanceM * Math.cos(rad)) / 111320;
  const dLng = (distanceM * Math.sin(rad)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lng + dLng];
}

// Boote auf Streife (PATROL) liegen real auf dem Wasser, ihre gespeicherte
// Position ist aber meist die Strand-/Turmposition. Daher zeichnen wir sie auf
// der Karte um `patrolOffsetMeters` (Default 150 m) in Richtung See (`seaBearing`,
// Default Osten) versetzt – rein visuell, die DB-Koordinaten bleiben unberührt.
function _boatDisplayLatLng(boat) {
  if (boat.status !== 'PATROL') return [boat.latitude, boat.longitude];
  const cfg = _mapConfig();
  const distance = typeof cfg.patrolOffsetMeters === 'number' ? cfg.patrolOffsetMeters : 150;
  const bearing = typeof cfg.seaBearing === 'number' ? cfg.seaBearing : 90;
  return _offsetLatLng(boat.latitude, boat.longitude, distance, bearing);
}

function initMap() {
  if (_map) return;
  // Fallback-Zentrum: DLRG Hauptwache Dahme (Strandpromenade), falls /api/config fehlt.
  const mapConfig = _mapConfig();
  const center = mapConfig.center || [54.21449, 11.08967];
  const zoom = mapConfig.zoom || 15;
  const mapBounds = _configuredMapBounds();
  const mapOptions = {
    minZoom: mapConfig.minZoom || 7,
    worldCopyJump: false
  };
  if (mapBounds) {
    mapOptions.maxBounds = mapBounds;
    mapOptions.maxBoundsViscosity = 1;
  }
  _map = L.map('map', mapOptions).setView(center, zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    noWrap: true,
    bounds: mapBounds,
    attribution: '© OpenStreetMap'
  }).addTo(_map);
  _markerLayer = L.layerGroup().addTo(_map);

  // Klick auf die Karte legt im "Turm setzen"-Modus einen Turm an dieser Position an.
  _map.on('click', (e) => {
    if (!_addTowerMode) return;
    setAddTowerMode(false);
    openTowerModal(null, e.latlng.lat, e.latlng.lng);
  });

  // Rechtsklick (Wachführer): Kontextmenü „Turm/Boot hier anlegen" an der Klickposition.
  _map.on('contextmenu', (e) => {
    if (typeof isWachfuehrer === 'function' && isWachfuehrer()) {
      showMapContextMenu(e);
    }
  });
}

// ── Rechtsklick-Kontextmenü (Wachführer) ─────────────────────
// Legt Turm bzw. Boot direkt an der angeklickten Geo-Position an (öffnet das
// jeweilige Modal mit vorbefüllter lat/lng). Nur sichtbar für den Wachführer.
function _ensureMapContextMenu() {
  let menu = document.getElementById('map-context-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'map-context-menu';
    menu.className = 'map-context-menu';
    document.body.appendChild(menu);
    // Jeder Links-Klick / Scroll schließt das Menü wieder.
    document.addEventListener('click', hideMapContextMenu);
    if (_map) _map.on('movestart zoomstart', hideMapContextMenu);
  }
  return menu;
}

function hideMapContextMenu() {
  const menu = document.getElementById('map-context-menu');
  if (menu) menu.style.display = 'none';
}

function showMapContextMenu(e) {
  const lat = e.latlng.lat, lng = e.latlng.lng;
  openMapContextMenu(e.originalEvent, lat, lng, [
    { label: '📍 Turm hier anlegen', fn: () => openTowerModal(null, lat, lng) },
    { label: '⛵ Boot hier anlegen', fn: () => openBoatModal(null, lat, lng) }
  ]);
}

// Generisches Kontextmenü an einer Geo-Position (von Einsatz- und Demo-Karte genutzt).
function openMapContextMenu(originalEvent, lat, lng, items) {
  const menu = _ensureMapContextMenu();
  menu.innerHTML = `<div class="ctx-coord">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>`;
  items.forEach(it => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = it.label;
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); hideMapContextMenu(); it.fn(); });
    menu.appendChild(btn);
  });
  // Am Mauszeiger positionieren (Seitenkoordinaten); ggf. an den Viewport klemmen.
  const oe = originalEvent;
  menu.style.display = 'block';
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  const x = Math.min(oe.pageX, window.scrollX + document.documentElement.clientWidth - mw - 6);
  const y = Math.min(oe.pageY, window.scrollY + document.documentElement.clientHeight - mh - 6);
  menu.style.left = Math.max(window.scrollX + 6, x) + 'px';
  menu.style.top = Math.max(window.scrollY + 6, y) + 'px';
}

function _markerShell(pinClass, symbol, title) {
  return `<div class="map-marker-shell" title="${escapeHtml(title || '')}">` +
    `<div class="map-marker-pulse"></div>` +
    `<div class="map-marker-stem"></div>` +
    `<div class="map-marker-pin ${pinClass}"></div>` +
    `<div class="map-marker-symbol">${symbol}</div>` +
    `</div>`;
}

// Farbiger Turm-Marker (für den Wachführer, da circleMarker nicht draggable ist).
function _towerIcon(status, hasBoat) {
  const safeStatus = TOWER_COLORS[status] ? status : 'UNKNOWN';
  const boatBadge = hasBoat ? '<div class="map-marker-boat-badge" title="Boot zugeordnet">⛵</div>' : '';
  return L.divIcon({
    className: `map-marker-icon tower-marker${hasBoat ? ' has-boat' : ''}`,
    html: _markerShell(`tower-marker-pin status-${safeStatus}`, hasBoat ? '🛟' : '🛟', hasBoat ? 'Turm mit Boot' : 'Turm') + boatBadge,
    iconSize: [38, 44],
    iconAnchor: [19, 43],
    popupAnchor: [0, -38]
  });
}

function _towerHasBoat(towerId) {
  return boats.some(b => b.towerId === towerId);
}

function _boatIcon(status) {
  const knownBoatStatuses = ['AVAILABLE', 'READY', 'PATROL', 'DEPLOYED', 'OUT_OF_SERVICE'];
  const safeStatus = knownBoatStatuses.includes(status) ? status : 'UNKNOWN';
  return L.divIcon({
    className: 'map-marker-icon boat-marker',
    html: _markerShell(`boat-marker-pin status-${safeStatus}`, '⛵', 'Boot'),
    iconSize: [34, 42],
    iconAnchor: [17, 41],
    popupAnchor: [0, -36]
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
    className: 'map-marker-icon emoji-marker',
    html: _markerShell('emoji-marker-pin', emoji, ''),
    iconSize: [30, 36],
    iconAnchor: [15, 35],
    popupAnchor: [0, -31]
  });
}

function scheduleRenderMap() {
  if (_renderMapScheduled) return;
  _renderMapScheduled = true;
  const run = () => {
    _renderMapScheduled = false;
    renderMap();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 0);
}

function renderMap() {
  if (!_map) return;
  _markerLayer.clearLayers();

  // Türme: für den Wachführer als verschiebbare Marker (Positionieren), sonst als
  // farbcodierte Marker (reine Anzeige). Türme mit zugeordnetem Boot erhalten
  // einen Badge + goldene Hervorhebung, damit sie sofort anders erkennbar sind.
  const canEditTowers = typeof isWachfuehrer === 'function' && isWachfuehrer();
  towers.forEach(t => {
    if (t.latitude == null || t.longitude == null) return;
    const hasBoat = _towerHasBoat(t.id);
    let popup =
      `<b>${escapeHtml(t.name)}</b> ${t.callSign ? '(' + escapeHtml(t.callSign) + ')' : ''}<br>` +
      `Status: ${escapeHtml(labelOf('towerStatus', t.status))}<br>` +
      `Besetzung: ${t.currentStaff}/${t.requiredStaff}` +
      (hasBoat ? '<br><b>⛵ Boot zugeordnet</b>' : '');
    if (canEditTowers) {
      popup += `<br><div style="margin-top:6px;display:flex;align-items:center;gap:6px">` +
        `Anwesend: <button onclick="adjustTowerPresent(${t.id}, -1)" ${t.presentStaff <= 0 ? 'disabled' : ''}>−</button>` +
        `<b>${t.presentStaff}</b>` +
        `<button onclick="adjustTowerPresent(${t.id}, 1)">+</button></div>`;
      popup += `<div style="margin-top:6px;display:flex;gap:6px">` +
        `<button onclick="openTowerById(${t.id})">Bearbeiten</button>` +
        `<button class="danger" onclick="deleteTower(${t.id})">Löschen</button></div>`;
      const marker = L.marker([t.latitude, t.longitude], { icon: _towerIcon(t.status, hasBoat), draggable: true });
      marker.on('dragend', (ev) => {
        const ll = ev.target.getLatLng();
        moveTower(t.id, ll.lat, ll.lng);
      });
      marker.bindPopup(popup).addTo(_markerLayer);
    } else {
      L.marker([t.latitude, t.longitude], { icon: _towerIcon(t.status, hasBoat) })
        .bindPopup(popup)
        .addTo(_markerLayer);
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

  // Boote – auf Streife seewärts versetzt gezeichnet (siehe _boatDisplayLatLng).
  boats.forEach(b => {
    if (b.latitude == null || b.longitude == null) return;
    const onPatrol = b.status === 'PATROL';
    const offsetM = typeof _mapConfig().patrolOffsetMeters === 'number' ? _mapConfig().patrolOffsetMeters : 150;
    L.marker(_boatDisplayLatLng(b), { icon: _boatIcon(b.status) })
      .bindPopup(`<b>⛵ ${escapeHtml(b.name)}</b> ${b.callSign ? '(' + escapeHtml(b.callSign) + ')' : ''}<br>` +
        escapeHtml(labelOf('boatStatus', b.status)) +
        (onPatrol ? `<br><span style="color:#888;font-size:.85em">Position ~${offsetM} m seewärts (Streife)</span>` : ''))
      .addTo(_markerLayer);
  });
}

// ── Demo-Konfigurations-Karte (Admin positioniert Vorlagen-Türme/-Boote) ──────
// Eigene Leaflet-Instanz im Verwaltung-Tab. Vorlagen-Türme (📍) und -Boote (⛵)
// sind verschiebbare Marker (Drag → PATCH der Position); Rechtsklick legt eine
// Vorlage an der angeklickten Stelle an. Spiegelbild der Einsatzkarte – aber
// gegen die admin-only tower_templates/boat_templates statt der WF-Objekte.
function initTemplateMap() {
  if (_templateMap) { _templateMap.invalidateSize(); return; }
  const elMap = document.getElementById('template-map');
  if (!elMap || typeof L === 'undefined') return;
  const mapConfig = _mapConfig();
  const center = mapConfig.center || [54.21449, 11.08967];
  const zoom = mapConfig.zoom || 15;
  const mapBounds = _configuredMapBounds();
  const mapOptions = {
    minZoom: mapConfig.minZoom || 7,
    worldCopyJump: false
  };
  if (mapBounds) {
    mapOptions.maxBounds = mapBounds;
    mapOptions.maxBoundsViscosity = 1;
  }
  _templateMap = L.map('template-map', mapOptions).setView(center, zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    noWrap: true,
    bounds: mapBounds,
    attribution: '© OpenStreetMap'
  }).addTo(_templateMap);
  _templateMarkerLayer = L.layerGroup().addTo(_templateMap);

  _templateMap.on('contextmenu', (e) => {
    const lat = e.latlng.lat, lng = e.latlng.lng;
    openMapContextMenu(e.originalEvent, lat, lng, [
      { label: '📍 Vorlagen-Turm hier anlegen', fn: () => openTemplateModal(null, lat, lng) },
      { label: '⛵ Vorlagen-Boot hier anlegen', fn: () => openBoatTemplateModal(null, lat, lng) }
    ]);
  });
  _templateMap.on('movestart zoomstart', hideMapContextMenu);
  setTimeout(() => _templateMap.invalidateSize(), 60);
}

function renderTemplateMap() {
  if (!_templateMap || !_templateMarkerLayer) return;
  _templateMarkerLayer.clearLayers();

  (typeof towerTemplates !== 'undefined' ? towerTemplates : []).forEach(t => {
    if (t.latitude == null || t.longitude == null) return;
    const marker = L.marker([t.latitude, t.longitude], { icon: _towerIcon('GREEN', false), draggable: true });
    marker.on('dragend', (ev) => {
      const ll = ev.target.getLatLng();
      moveTowerTemplate(t.id, ll.lat, ll.lng);
    });
    marker.bindPopup(
      `<b>📍 ${escapeHtml(t.name)}</b> ${t.callSign ? '(' + escapeHtml(t.callSign) + ')' : ''}<br>` +
      `Soll: ${t.requiredStaff}` +
      `<br><div style="margin-top:6px;display:flex;gap:6px">` +
      `<button onclick="openTemplateById(${t.id})">Bearbeiten</button>` +
      `<button class="danger" onclick="deleteTemplate(${t.id})">Löschen</button></div>`
    ).addTo(_templateMarkerLayer);
  });

  (typeof boatTemplates !== 'undefined' ? boatTemplates : []).forEach(b => {
    if (b.latitude == null || b.longitude == null) return;
    const marker = L.marker([b.latitude, b.longitude], { icon: _boatIcon(b.status), draggable: true });
    marker.on('dragend', (ev) => {
      const ll = ev.target.getLatLng();
      moveBoatTemplate(b.id, ll.lat, ll.lng);
    });
    marker.bindPopup(
      `<b>⛵ ${escapeHtml(b.name)}</b> ${b.callSign ? '(' + escapeHtml(b.callSign) + ')' : ''}<br>` +
      escapeHtml(labelOf('boatStatus', b.status)) +
      `<br><div style="margin-top:6px;display:flex;gap:6px">` +
      `<button onclick="openBoatTemplateById(${b.id})">Bearbeiten</button>` +
      `<button class="danger" onclick="deleteBoatTemplate(${b.id})">Löschen</button></div>`
    ).addTo(_templateMarkerLayer);
  });
}
