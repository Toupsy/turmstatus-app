import { useState } from "react";
import api from "../api";
import { useStore } from "../store";
import { REASON_LABEL } from "../constants";

function Kpi({ value, label }) {
  return (
    <div className="card">
      <div className="kpi">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const { summary, requests, refreshAll } = useStore();
  const [busy, setBusy] = useState(null);
  const pending = requests.filter((r) => r.status === "PENDING");

  const decide = async (id, action) => {
    setBusy(id);
    try {
      const body =
        action === "reject"
          ? { rejection_reason: prompt("Ablehnungsgrund (optional):") || null }
          : undefined;
      await api.post(`/requests/${id}/${action}`, body);
      await refreshAll();
    } catch (e) {
      alert(e.response?.data?.detail || "Fehler");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="content">
      <h2 className="section-title">Personalübersicht</h2>
      <div className="grid cards">
        <Kpi value={summary?.tower_count ?? "–"} label="Türme" />
        <Kpi value={summary?.on_duty_count ?? "–"} label="Personen im Dienst" />
        <Kpi value={summary?.active_minus_one ?? "–"} label="Aktive -1" />
        <Kpi value={summary?.boat_count ?? "–"} label="Boote" />
        <Kpi value={summary?.pending_requests ?? "–"} label="Offene Anfragen" />
        <Kpi
          value={
            summary
              ? `${summary.towers_green}/${summary.towers_yellow}/${summary.towers_red}`
              : "–"
          }
          label="Türme grün/gelb/rot"
        />
      </div>

      <h2 className="section-title">Offene -1 Anfragen</h2>
      {pending.length === 0 && <p className="label">Keine offenen Anfragen.</p>}
      <div className="list">
        {pending.map((r) => (
          <div className="row" key={r.id}>
            <div className="grow">
              <strong>{r.guard_name}</strong>
              <div className="label">
                Grund: {REASON_LABEL[r.reason]}
                {r.note ? ` · „${r.note}“` : ""}
              </div>
            </div>
            <button
              className="btn btn-green"
              disabled={busy === r.id}
              onClick={() => decide(r.id, "approve")}
            >
              Genehmigen
            </button>
            <button
              className="btn btn-red"
              disabled={busy === r.id}
              onClick={() => decide(r.id, "reject")}
            >
              Ablehnen
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
