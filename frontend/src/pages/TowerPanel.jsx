import { useState } from "react";
import api from "../api";
import { useStore } from "../store";
import {
  GUARD_COLOR,
  GUARD_LABEL,
  REASON_LABEL,
  REQUEST_STATUS_LABEL,
} from "../constants";

export default function TowerPanel() {
  const { user, towers, guards, requests, refreshAll } = useStore();
  const tower = towers.find((t) => t.id === user.tower_id);
  const [staff, setStaff] = useState("");
  const [busy, setBusy] = useState(false);

  if (!tower) {
    return (
      <div className="content">
        <p className="label">Kein Turm zugeordnet. Bitte an die Hauptwache wenden.</p>
      </div>
    );
  }

  const saveStaff = async () => {
    setBusy(true);
    try {
      await api.patch(`/towers/${tower.id}`, { required_staff: Number(staff) });
      setStaff("");
      await refreshAll();
    } catch (e) {
      alert(e.response?.data?.detail || "Fehler");
    } finally {
      setBusy(false);
    }
  };

  const confirmReturn = async (id) => {
    setBusy(true);
    try {
      await api.post(`/requests/${id}/return`);
      await refreshAll();
    } catch (e) {
      alert(e.response?.data?.detail || "Fehler");
    } finally {
      setBusy(false);
    }
  };

  const activeReqs = requests.filter((r) => ["PENDING", "APPROVED"].includes(r.status));

  return (
    <div className="content">
      <h2 className="section-title">{tower.name}</h2>
      <div className="row">
        <div className="grow">
          Funkrufname: <strong>{tower.call_sign}</strong>
          <div className="label">
            Besetzung {tower.staff_in_area}/{tower.required_staff}
          </div>
        </div>
        <span
          className="badge"
          style={{ background: GUARD_COLOR.IN_AREA, opacity: 0.9 }}
        >
          {tower.status}
        </span>
      </div>

      <h2 className="section-title">Sollstärke anpassen</h2>
      <div className="row">
        <input
          className="grow"
          type="number"
          min="0"
          placeholder={`aktuell ${tower.required_staff}`}
          value={staff}
          onChange={(e) => setStaff(e.target.value)}
          style={{ padding: 10, borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <button className="btn btn-primary" disabled={busy || staff === ""} onClick={saveStaff}>
          Speichern
        </button>
      </div>

      <h2 className="section-title">Aktive Wachgänger</h2>
      <div className="list">
        {guards.map((g) => (
          <div className="row" key={g.id}>
            <div className="grow">{g.name}</div>
            <span className="badge" style={{ background: GUARD_COLOR[g.status] }}>
              {GUARD_LABEL[g.status]}
            </span>
          </div>
        ))}
      </div>

      <h2 className="section-title">Offene / aktive Anfragen</h2>
      {activeReqs.length === 0 && <p className="label">Keine aktiven Anfragen.</p>}
      <div className="list">
        {activeReqs.map((r) => (
          <div className="row" key={r.id}>
            <div className="grow">
              <strong>{r.guard_name}</strong>
              <div className="label">
                {REASON_LABEL[r.reason]} · {REQUEST_STATUS_LABEL[r.status]}
              </div>
            </div>
            {r.status === "APPROVED" && (
              <button className="btn btn-green" disabled={busy} onClick={() => confirmReturn(r.id)}>
                +1 bestätigen
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
