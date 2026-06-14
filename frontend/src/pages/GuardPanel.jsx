import { useState } from "react";
import api from "../api";
import { useStore } from "../store";
import { GUARD_COLOR, GUARD_LABEL, REASON_LABEL, REQUEST_STATUS_LABEL } from "../constants";

const REASONS = ["PAUSE", "TOILET", "CATERING", "MATERIAL", "OTHER"];

export default function GuardPanel() {
  const { guards, requests, refreshAll } = useStore();
  const guard = guards[0]; // Backend liefert Wachgängern nur den eigenen Eintrag.
  const [reason, setReason] = useState("PAUSE");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const activeReq = requests.find((r) => ["PENDING", "APPROVED"].includes(r.status));

  if (!guard) {
    return (
      <div className="content">
        <p className="label">Kein Wachgänger-Profil verknüpft. Bitte an die Hauptwache wenden.</p>
      </div>
    );
  }

  const request = async () => {
    setBusy(true);
    try {
      await api.post("/requests/minus-one", { guard_id: guard.id, reason, note: note || null });
      setNote("");
      await refreshAll();
    } catch (e) {
      alert(e.response?.data?.detail || "Fehler");
    } finally {
      setBusy(false);
    }
  };

  const back = async () => {
    setBusy(true);
    try {
      await api.post(`/requests/${activeReq.id}/return`);
      await refreshAll();
    } catch (e) {
      alert(e.response?.data?.detail || "Fehler");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content">
      <h2 className="section-title">Mein Status</h2>
      <div className="row">
        <div className="grow">
          <strong>{guard.name}</strong>
        </div>
        <span className="badge" style={{ background: GUARD_COLOR[guard.status] }}>
          {GUARD_LABEL[guard.status]}
        </span>
      </div>

      {activeReq && activeReq.status === "PENDING" && (
        <p className="label" style={{ marginTop: 14 }}>
          Anfrage gesendet – warte auf Bestätigung der Hauptwache…
        </p>
      )}

      {activeReq && activeReq.status === "APPROVED" ? (
        <>
          <h2 className="section-title">-1 aktiv</h2>
          <p className="label">Grund: {REASON_LABEL[activeReq.reason]}</p>
          <button className="btn btn-green btn-block btn-lg" disabled={busy} onClick={back}>
            ✅ Zurück im Bereich (+1)
          </button>
        </>
      ) : !activeReq ? (
        <>
          <h2 className="section-title">Bereich verlassen (-1)</h2>
          <div className="field">
            <label>Grund</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Freitext (optional)</label>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={request}>
            🚶 Bereich verlassen
          </button>
        </>
      ) : null}

      <h2 className="section-title">Letzte Meldungen</h2>
      <div className="list">
        {requests.slice(0, 6).map((r) => (
          <div className="row" key={r.id}>
            <div className="grow">
              {REASON_LABEL[r.reason]}
              <div className="label">{new Date(r.created_at).toLocaleString("de-DE")}</div>
            </div>
            <span className="badge" style={{ background: "#475569" }}>
              {REQUEST_STATUS_LABEL[r.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
