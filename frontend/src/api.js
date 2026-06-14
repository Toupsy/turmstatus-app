import axios from "axios";

const api = axios.create({ baseURL: "/api" });

// Token aus localStorage an jede Anfrage hängen.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Bei 401 automatisch ausloggen.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      if (!location.pathname.startsWith("/login")) location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export async function login(username, password) {
  // OAuth2 Password Flow erwartet form-urlencoded.
  const body = new URLSearchParams();
  body.append("username", username);
  body.append("password", password);
  const { data } = await api.post("/auth/login", body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  localStorage.setItem("token", data.access_token);
  return data;
}

export default api;
