// Labels & Farben – spiegeln die Enums aus backend/app/models.py wider.

export const ROLE_LABEL = {
  HAUPTWACHE: "Hauptwache",
  TURMFUEHRER: "Turmführer",
  WACHGAENGER: "Wachgänger",
};

export const TOWER_COLOR = {
  GREEN: "#16a34a",
  YELLOW: "#eab308",
  RED: "#dc2626",
};
export const TOWER_LABEL = {
  GREEN: "Vollständig besetzt",
  YELLOW: "Reduzierte Stärke",
  RED: "Kritisch besetzt",
};

export const GUARD_COLOR = {
  IN_AREA: "#16a34a",
  MINUS_ONE: "#eab308",
  DEPLOYED: "#dc2626",
  BREAK: "#3b82f6",
};
export const GUARD_LABEL = {
  IN_AREA: "Im Bereich",
  MINUS_ONE: "-1 aktiv",
  DEPLOYED: "Einsatz",
  BREAK: "Pause",
};

export const BOAT_COLOR = {
  AT_TOWER: "#16a34a",
  PATROL: "#3b82f6",
  DEPLOYED: "#dc2626",
  OUT_OF_SERVICE: "#6b7280",
};
export const BOAT_LABEL = {
  AT_TOWER: "Am Turm",
  PATROL: "Auf Streife",
  DEPLOYED: "Im Einsatz",
  OUT_OF_SERVICE: "Außer Dienst",
};

export const REASON_LABEL = {
  PAUSE: "Pause",
  TOILET: "Toilette",
  CATERING: "Verpflegung",
  MATERIAL: "Material holen",
  OTHER: "Sonstiges",
};

export const REQUEST_STATUS_LABEL = {
  PENDING: "Ausstehend",
  APPROVED: "-1 aktiv",
  REJECTED: "Abgelehnt",
  RETURNED: "+1 zurück",
};
