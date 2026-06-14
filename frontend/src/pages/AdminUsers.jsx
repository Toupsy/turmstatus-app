import { useEffect, useState } from "react";
import api from "../api";
import { useStore } from "../store";
import { ROLE_LABEL } from "../constants";

const EMPTY = { username: "", full_name: "", password: "", role: "WACHGAENGER", tower_id: "" };

export default function AdminUsers() {
  const { towers } = useStore();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await api.get("/users");
    setUsers(data);
  };
  useEffect(() => {
    load();
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/users", {
        ...form,
        tower_id: form.tower_id ? Number(form.tower_id) : null,
      });
      setForm(EMPTY);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Fehler beim Anlegen");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u) => {
    await api.patch(`/users/${u.id}`, { is_active: !u.is_active });
    await load();
  };

  return (
    <div className="content">
      <h2 className="section-title">Benutzer anlegen</h2>
      <form className="card" onSubmit={create}>
        <div className="field">
          <label>Benutzername</label>
          <input value={form.username} onChange={set("username")} required />
        </div>
        <div className="field">
          <label>Voller Name</label>
          <input value={form.full_name} onChange={set("full_name")} required />
        </div>
        <div className="field">
          <label>Passwort (min. 6 Zeichen)</label>
          <input type="password" value={form.password} onChange={set("password")} required />
        </div>
        <div className="field">
          <label>Rolle</label>
          <select value={form.role} onChange={set("role")}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Turm</label>
          <select value={form.tower_id} onChange={set("tower_id")}>
            <option value="">– keiner –</option>
            {towers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>Anlegen</button>
      </form>

      <h2 className="section-title">Benutzer</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Benutzer</th>
            <th>Rolle</th>
            <th>Aktiv</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.full_name}</td>
              <td>{u.username}</td>
              <td>{ROLE_LABEL[u.role]}</td>
              <td>{u.is_active ? "✅" : "—"}</td>
              <td>
                <button className="btn" onClick={() => toggleActive(u)}>
                  {u.is_active ? "Deaktivieren" : "Aktivieren"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
