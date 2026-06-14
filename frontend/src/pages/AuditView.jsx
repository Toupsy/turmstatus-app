import { useEffect, useState } from "react";
import api from "../api";

const ACTION_LABEL = {
  LOGIN: "Anmeldung",
  TOWER_CREATED: "Turm angelegt",
  TOWER_UPDATED: "Turm geändert",
  GUARD_STATUS: "Wachgänger-Status geändert",
  BOAT_CREATED: "Boot angelegt",
  BOAT_UPDATED: "Boot geändert",
  MINUS_ONE_REQUESTED: "-1 beantragt",
  MINUS_ONE_APPROVED: "-1 genehmigt",
  MINUS_ONE_REJECTED: "-1 abgelehnt",
  MINUS_ONE_RETURNED: "-1 beendet (+1)",
  USER_CREATED: "Benutzer angelegt",
  USER_UPDATED: "Benutzer geändert",
};

export default function AuditView() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get("/audit").then(({ data }) => setLogs(data));
  }, []);

  return (
    <div className="content">
      <h2 className="section-title">Audit-Protokoll</h2>
      <table>
        <thead>
          <tr>
            <th>Zeit</th>
            <th>Wer</th>
            <th>Aktion</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td>{new Date(l.created_at).toLocaleString("de-DE")}</td>
              <td>{l.actor_name}</td>
              <td>{ACTION_LABEL[l.action] || l.action}</td>
              <td>
                {l.detail && Object.keys(l.detail).length > 0
                  ? JSON.stringify(l.detail)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
