import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents } from "react-leaflet";
import api from "../api";
import { useStore } from "../store";
import { TOWER_COLOR, BOAT_COLOR, BOAT_LABEL } from "../constants";

const EMPTY_TOWER = { name: "", call_sign: "", latitude: "", longitude: "", required_staff: 2 };
const EMPTY_BOAT = { name: "", call_sign: "", tower_id: "", latitude: "", longitude: "", status: "AT_TOWER" };

// Fängt Klicks auf der Karte ab und meldet die Koordinaten zurück.
function MapClicker({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function AdminTowers() {
  const { towers, boats, refreshTowers, refreshBoats } = useStore();
  const [tab, setTab] = useState("tower");
  const [tower, setTower] = useState(EMPTY_TOWER);
  const [boat, setBoat] = useState(EMPTY_BOAT);
  const [editTowerId, setEditTowerId] = useState(null);
  const [editBoatId, setEditBoatId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isTower = tab === "tower";
  const form = isTower ? tower : boat;
  const setForm = isTower ? setTower : setBoat;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const center =
    towers.length > 0
      ? [
          towers.reduce((s, t) => s + t.latitude, 0) / towers.length,
          towers.reduce((s, t) => s + t.longitude, 0) / towers.length,
        ]
      : [53.96, 10.87];

  // Position aus Kartenklick übernehmen (auf 5 Nachkommastellen gerundet).
  const onPick = (lat, lng) => {
    setForm({ ...form, latitude: lat.toFixed(5), longitude: lng.toFixed(5) });
  };

  const resetTower = () => {
    setTower(EMPTY_TOWER);
    setEditTowerId(null);
  };
  const resetBoat = () => {
    setBoat(EMPTY_BOAT);
    setEditBoatId(null);
  };

  const editTower = (t) => {
    setTab("tower");
    setEditTowerId(t.id);
    setTower({
      name: t.name,
      call_sign: t.call_sign,
      latitude: String(t.latitude),
      longitude: String(t.longitude),
      required_staff: t.required_staff,
    });
  };
  const editBoat = (b) => {
    setTab("boat");
    setEditBoatId(b.id);
    setBoat({
      name: b.name,
      call_sign: b.call_sign,
      tower_id: b.tower_id ? String(b.tower_id) : "",
      latitude: b.latitude != null ? String(b.latitude) : "",
      longitude: b.longitude != null ? String(b.longitude) : "",
      status: b.status,
    });
  };

  const saveTower = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        name: tower.name,
        call_sign: tower.call_sign,
        latitude: Number(tower.latitude),
        longitude: Number(tower.longitude),
        required_staff: Number(tower.required_staff),
      };
      if (editTowerId) await api.patch(`/towers/${editTowerId}`, payload);
      else await api.post("/towers", payload);
      resetTower();
      await refreshTowers();
    } catch (err) {
      setError(err.response?.data?.detail || "Fehler beim Speichern des Turms");
    } finally {
      setBusy(false);
    }
  };

  const deleteTower = async (t) => {
    if (!window.confirm(`Turm „${t.name}“ wirklich löschen?`)) return;
    setError("");
    try {
      await api.delete(`/towers/${t.id}`);
      if (editTowerId === t.id) resetTower();
      await refreshTowers();
    } catch (err) {
      setError(err.response?.data?.detail || "Fehler beim Löschen des Turms");
    }
  };

  const deleteBoat = async (b) => {
    if (!window.confirm(`Boot „${b.name}“ wirklich löschen?`)) return;
    setError("");
    try {
      await api.delete(`/boats/${b.id}`);
      if (editBoatId === b.id) resetBoat();
      await refreshBoats();
    } catch (err) {
      setError(err.response?.data?.detail || "Fehler beim Löschen des Boots");
    }
  };

  const saveBoat = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        name: boat.name,
        call_sign: boat.call_sign,
        tower_id: boat.tower_id ? Number(boat.tower_id) : null,
        latitude: boat.latitude !== "" ? Number(boat.latitude) : null,
        longitude: boat.longitude !== "" ? Number(boat.longitude) : null,
      };
      if (editBoatId) await api.patch(`/boats/${editBoatId}`, { ...payload, status: boat.status });
      else await api.post("/boats", payload);
      resetBoat();
      await refreshBoats();
    } catch (err) {
      setError(err.response?.data?.detail || "Fehler beim Speichern des Boots");
    } finally {
      setBusy(false);
    }
  };

  const hasPick = form.latitude !== "" && form.longitude !== "";

  return (
    <div className="content">
      <h2 className="section-title">Türme &amp; Boote setzen</h2>
      <p className="card" style={{ marginBottom: 14 }}>
        Wähle <strong>Turm</strong> oder <strong>Boot</strong>, klicke auf die Karte, um die
        Position zu setzen, und speichere. Zum Bearbeiten unten in der Liste auf „Bearbeiten“
        tippen.
      </p>

      <div className="nav" style={{ marginBottom: 12 }}>
        <button
          className="btn"
          style={isTower ? { background: "var(--navy)", color: "#fff" } : {}}
          onClick={() => { setTab("tower"); setError(""); }}
        >
          🗼 Turm
        </button>
        <button
          className="btn"
          style={!isTower ? { background: "var(--navy)", color: "#fff" } : {}}
          onClick={() => { setTab("boat"); setError(""); }}
        >
          ⛵ Boot
        </button>
      </div>

      <div className="pick-map">
        <MapContainer center={center} zoom={13} scrollWheelZoom>
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClicker onPick={onPick} />

          {towers.map((t) => (
            <CircleMarker
              key={`t${t.id}`}
              center={[t.latitude, t.longitude]}
              radius={12}
              pathOptions={{ color: "#1e293b", weight: 2, fillColor: TOWER_COLOR[t.status], fillOpacity: 0.7 }}
            >
              <Tooltip permanent direction="top" offset={[0, -8]}>{t.call_sign}</Tooltip>
            </CircleMarker>
          ))}

          {boats
            .filter((b) => b.latitude != null && b.longitude != null)
            .map((b) => (
              <CircleMarker
                key={`b${b.id}`}
                center={[b.latitude, b.longitude]}
                radius={8}
                pathOptions={{ color: "#1e293b", weight: 2, fillColor: BOAT_COLOR[b.status], fillOpacity: 0.7 }}
              >
                <Tooltip direction="bottom">⛵ {b.call_sign}</Tooltip>
              </CircleMarker>
            ))}

          {hasPick && (
            <CircleMarker
              center={[Number(form.latitude), Number(form.longitude)]}
              radius={11}
              pathOptions={{ color: "#dc2626", weight: 3, fillColor: "#dc2626", fillOpacity: 0.35 }}
            >
              <Tooltip permanent direction="right">Neue Position</Tooltip>
            </CircleMarker>
          )}
        </MapContainer>
      </div>

      {isTower ? (
        <form className="card" onSubmit={saveTower} style={{ marginTop: 14 }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            {editTowerId ? "Turm bearbeiten" : "Neuen Turm anlegen"}
          </h3>
          <div className="field">
            <label>Name</label>
            <input value={tower.name} onChange={set("name")} required />
          </div>
          <div className="field">
            <label>Funkrufname</label>
            <input value={tower.call_sign} onChange={set("call_sign")} required />
          </div>
          <div className="row">
            <div className="field grow">
              <label>Breitengrad (Latitude)</label>
              <input value={tower.latitude} onChange={set("latitude")} required placeholder="auf Karte klicken" />
            </div>
            <div className="field grow">
              <label>Längengrad (Longitude)</label>
              <input value={tower.longitude} onChange={set("longitude")} required placeholder="auf Karte klicken" />
            </div>
          </div>
          <div className="field">
            <label>Sollstärke (Personen)</label>
            <input type="number" min="0" max="50" value={tower.required_staff} onChange={set("required_staff")} required />
          </div>
          {error && <div className="error">{error}</div>}
          <div className="row">
            <button className="btn btn-primary" disabled={busy}>
              {editTowerId ? "Änderungen speichern" : "Turm anlegen"}
            </button>
            {editTowerId && (
              <button type="button" className="btn" onClick={resetTower}>Abbrechen</button>
            )}
          </div>
        </form>
      ) : (
        <form className="card" onSubmit={saveBoat} style={{ marginTop: 14 }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            {editBoatId ? "Boot bearbeiten" : "Neues Boot anlegen"}
          </h3>
          <div className="field">
            <label>Name</label>
            <input value={boat.name} onChange={set("name")} required />
          </div>
          <div className="field">
            <label>Funkrufname</label>
            <input value={boat.call_sign} onChange={set("call_sign")} required />
          </div>
          <div className="field">
            <label>Zugeordneter Turm</label>
            <select value={boat.tower_id} onChange={set("tower_id")}>
              <option value="">– keiner –</option>
              {towers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {editBoatId && (
            <div className="field">
              <label>Status</label>
              <select value={boat.status} onChange={set("status")}>
                {Object.entries(BOAT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          )}
          <div className="row">
            <div className="field grow">
              <label>Breitengrad (Latitude)</label>
              <input value={boat.latitude} onChange={set("latitude")} placeholder="optional – auf Karte klicken" />
            </div>
            <div className="field grow">
              <label>Längengrad (Longitude)</label>
              <input value={boat.longitude} onChange={set("longitude")} placeholder="optional – auf Karte klicken" />
            </div>
          </div>
          {error && <div className="error">{error}</div>}
          <div className="row">
            <button className="btn btn-primary" disabled={busy}>
              {editBoatId ? "Änderungen speichern" : "Boot anlegen"}
            </button>
            {editBoatId && (
              <button type="button" className="btn" onClick={resetBoat}>Abbrechen</button>
            )}
          </div>
        </form>
      )}

      <h2 className="section-title">Türme ({towers.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Funkrufname</th>
            <th>Position</th>
            <th>Soll</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {towers.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.call_sign}</td>
              <td>{t.latitude.toFixed(4)}, {t.longitude.toFixed(4)}</td>
              <td>{t.required_staff}</td>
              <td>
                <div className="row" style={{ background: "none", border: "none", padding: 0, gap: 6 }}>
                  <button className="btn" onClick={() => editTower(t)}>Bearbeiten</button>
                  <button className="btn btn-red" onClick={() => deleteTower(t)}>Löschen</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="section-title">Boote ({boats.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Funkrufname</th>
            <th>Status</th>
            <th>Position</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {boats.map((b) => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td>{b.call_sign}</td>
              <td>{BOAT_LABEL[b.status]}</td>
              <td>
                {b.latitude != null && b.longitude != null
                  ? `${b.latitude.toFixed(4)}, ${b.longitude.toFixed(4)}`
                  : "—"}
              </td>
              <td>
                <div className="row" style={{ background: "none", border: "none", padding: 0, gap: 6 }}>
                  <button className="btn" onClick={() => editBoat(b)}>Bearbeiten</button>
                  <button className="btn btn-red" onClick={() => deleteBoat(b)}>Löschen</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
