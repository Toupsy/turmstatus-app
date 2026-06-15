// Kompatibilitäts-Shim: der eigentliche Einstiegspunkt liegt unter server/.
// Erlaubt `node server.js` weiterhin (z. B. bei veraltetem compose-/Portainer-
// command). Eigentlicher Code: server/server.js.
require('./server/server.js');
