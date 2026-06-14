import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { ROLE_LABEL } from "../constants";

export default function Layout() {
  const { user, logout } = useStore();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>🛟 Turmstatus</h1>
        <nav className="nav">
          <NavLink to="/" end>Karte</NavLink>
          {user.role === "HAUPTWACHE" && <NavLink to="/dashboard">Dashboard</NavLink>}
          {user.role === "WACHGAENGER" && <NavLink to="/meine-wache">Meine Wache</NavLink>}
          {user.role === "TURMFUEHRER" && <NavLink to="/mein-turm">Mein Turm</NavLink>}
          {user.role === "HAUPTWACHE" && <NavLink to="/turme-boote">Türme &amp; Boote</NavLink>}
          {user.role === "HAUPTWACHE" && <NavLink to="/benutzer">Benutzer</NavLink>}
          {user.role === "HAUPTWACHE" && <NavLink to="/audit">Audit</NavLink>}
        </nav>
        <span className="who">
          {user.full_name} · {ROLE_LABEL[user.role]}
        </span>
        <button className="nav" onClick={onLogout}>Abmelden</button>
      </header>
      <Outlet />
    </div>
  );
}
