import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import { useStore } from "../store";
import {
  TOWER_COLOR,
  TOWER_LABEL,
  GUARD_COLOR,
  GUARD_LABEL,
  BOAT_COLOR,
  BOAT_LABEL,
} from "../constants";

export default function MapView() {
  const { towers, guards, boats } = useStore();

  // Kartenmittelpunkt: Durchschnitt der Türme, sonst Travemünde.
  const center =
    towers.length > 0
      ? [
          towers.reduce((s, t) => s + t.latitude, 0) / towers.length,
          towers.reduce((s, t) => s + t.longitude, 0) / towers.length,
        ]
      : [53.96, 10.87];

  return (
    <div className="content map" style={{ position: "relative" }}>
      <MapContainer center={center} zoom={13} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {towers.map((t) => (
          <CircleMarker
            key={`t${t.id}`}
            center={[t.latitude, t.longitude]}
            radius={14}
            pathOptions={{ color: "#1e293b", weight: 2, fillColor: TOWER_COLOR[t.status], fillOpacity: 0.9 }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              {t.call_sign}
            </Tooltip>
            <Popup>
              <strong>{t.name}</strong>
              <br />
              Funkrufname: {t.call_sign}
              <br />
              Status: {TOWER_LABEL[t.status]}
              <br />
              Besetzung: {t.staff_in_area}/{t.required_staff}
            </Popup>
          </CircleMarker>
        ))}

        {guards
          .filter((g) => g.latitude != null && g.longitude != null)
          .map((g) => (
            <CircleMarker
              key={`g${g.id}`}
              center={[g.latitude, g.longitude]}
              radius={7}
              pathOptions={{ color: "#1e293b", weight: 1, fillColor: GUARD_COLOR[g.status], fillOpacity: 1 }}
            >
              <Popup>
                <strong>{g.name}</strong>
                <br />
                Status: {GUARD_LABEL[g.status]}
              </Popup>
            </CircleMarker>
          ))}

        {boats
          .filter((b) => b.latitude != null && b.longitude != null)
          .map((b) => (
            <CircleMarker
              key={`b${b.id}`}
              center={[b.latitude, b.longitude]}
              radius={9}
              pathOptions={{ color: "#1e293b", weight: 2, fillColor: BOAT_COLOR[b.status], fillOpacity: 1 }}
            >
              <Tooltip direction="bottom">⛵ {b.call_sign}</Tooltip>
              <Popup>
                <strong>⛵ {b.name}</strong>
                <br />
                Funkrufname: {b.call_sign}
                <br />
                Status: {BOAT_LABEL[b.status]}
              </Popup>
            </CircleMarker>
          ))}
      </MapContainer>

      <div className="map-legend">
        <div className="item"><span className="dot" style={{ background: TOWER_COLOR.GREEN }} /> Turm besetzt</div>
        <div className="item"><span className="dot" style={{ background: TOWER_COLOR.YELLOW }} /> Reduziert</div>
        <div className="item"><span className="dot" style={{ background: TOWER_COLOR.RED }} /> Kritisch</div>
        <div className="item"><span className="dot" style={{ background: GUARD_COLOR.MINUS_ONE }} /> Wachgänger -1</div>
        <div className="item"><span className="dot" style={{ background: BOAT_COLOR.PATROL }} /> Boot Streife</div>
      </div>
    </div>
  );
}
