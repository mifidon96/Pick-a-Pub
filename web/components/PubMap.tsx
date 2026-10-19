"use client";

import { useEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Pub } from "@/lib/api";

// Map of the current results. Leaflet with OpenStreetMap tiles: free for light
// use with attribution (https://operations.osmfoundation.org/policies/tiles/).
// The tile server is also listed in the Content-Security-Policy in infra/web.tf.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

type Props = { pubs: Pub[]; centre: { lat: number; lng: number; label: string }; radiusM: number };

export default function PubMap({ pubs, centre, radiusM }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);

  // Create the map once. Leaflet touches window, so load it in the browser only.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((leaflet) => {
      if (cancelled || !el.current || map.current) return;
      L.current = leaflet;
      map.current = leaflet.map(el.current, { scrollWheelZoom: false }).setView([centre.lat, centre.lng], 15);
      leaflet.tileLayer(TILES, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map.current);
      layer.current = leaflet.layerGroup().addTo(map.current);
      draw();
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; draw() below handles updates
  }, []);

  function draw() {
    const leaflet = L.current, m = map.current, group = layer.current;
    if (!leaflet || !m || !group) return;
    group.clearLayers();

    // Where the search is centred.
    leaflet.circleMarker([centre.lat, centre.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#2563eb", fillOpacity: 1 })
      .bindTooltip(esc(centre.label))
      .addTo(group);

    for (const p of pubs) {
      const rated = p.stars !== null;
      const icon = leaflet.divIcon({
        className: "",
        iconSize: [40, 26],
        iconAnchor: [20, 26],
        popupAnchor: [0, -24],
        html: `<div class="pap-pin ${rated ? "pap-pin-rated" : ""}">${rated ? p.stars!.toFixed(1) : "&middot;"}</div>`,
      });
      const stars = rated ? `${p.stars!.toFixed(1)} ★ from ${p.review_count} review${p.review_count === 1 ? "" : "s"}` : "No ratings yet";
      leaflet.marker([p.lat, p.lng], { icon, title: p.name })
        .bindPopup(
          `<div style="min-width:160px"><strong>${esc(p.name)}</strong><br>` +
          `<span style="color:#5f6b63">${stars}</span><br>` +
          `<a href="/pub/?id=${p.id}" style="color:#14432a;font-weight:600">View pub</a></div>`,
        )
        .addTo(group);
    }

    // Fit the pubs, or show the search radius when there are none.
    const points = pubs.map((p) => [p.lat, p.lng] as [number, number]);
    if (points.length) m.fitBounds(leaflet.latLngBounds([...points, [centre.lat, centre.lng]]), { padding: [30, 30], maxZoom: 16 });
    else m.fitBounds(leaflet.latLng(centre.lat, centre.lng).toBounds(radiusM * 2));
  }

  useEffect(draw, [pubs, centre, radiusM]);

  return <div ref={el} className="h-[65vh] min-h-80 w-full overflow-hidden rounded-xl border border-line" aria-label="Map of pubs" />;
}
