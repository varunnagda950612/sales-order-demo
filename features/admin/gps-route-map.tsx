"use client";

import { useEffect, useRef } from "react";
import type { LatLngExpression, Map as LeafletMap } from "leaflet";
import { formatDateTimeForDisplay } from "@/lib/dates/india";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type GpsRouteMapStop = {
  id: string;
  stopNumber: number;
  shopName: string;
  area: string;
  capturedAt: string;
  latitude: number;
  longitude: number;
  mapUrl: string;
};

type GpsRouteMapProps = {
  stops: GpsRouteMapStop[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value: string) {
  return formatDateTimeForDisplay(value);
}

function decodePolyline(encoded: string) {
  const points: Array<[number, number]> = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);

    latitude += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);

    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([latitude / 1e5, longitude / 1e5]);
  }

  return points;
}

async function getRoadRoute(stops: GpsRouteMapStop[]) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke("route-path", {
    body: {
      points: stops.map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude })),
    },
  });

  if (error || data?.error) {
    throw new Error(data?.error || error?.message || "Could not calculate the road route.");
  }

  return (data?.polylines || []) as string[];
}

export function GpsRouteMap({ stops }: GpsRouteMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    async function renderMap() {
      const leaflet = await import("leaflet");

      if (cancelled || !mapElementRef.current) {
        return;
      }

      mapRef.current?.remove();
      mapRef.current = null;
      mapElementRef.current.innerHTML = "";

      if (!stops.length) {
        return;
      }

      const positions: LatLngExpression[] = stops.map((stop) => [stop.latitude, stop.longitude]);
      const map = leaflet.map(mapElementRef.current, {
        zoomControl: true,
        attributionControl: true,
      });

      mapRef.current = map;
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        })
        .addTo(map);

      if (positions.length === 1) {
        map.setView(positions[0], 16);
      } else {
        map.fitBounds(leaflet.latLngBounds(positions), { padding: [24, 24] });
      }

      const fallbackPath = leaflet
        .polyline(positions, {
          color: "#f47d21",
          dashArray: "8 8",
          weight: 5,
          opacity: 0.85,
        })
        .addTo(map);

      if (stops.length > 1) {
        void getRoadRoute(stops)
          .then((polylines) => {
            if (cancelled) {
              return;
            }

            const roadPoints = polylines.flatMap(decodePolyline);
            if (!roadPoints.length) {
              return;
            }

            fallbackPath.remove();
            leaflet
              .polyline(roadPoints, {
                color: "#11844f",
                lineCap: "round",
                lineJoin: "round",
                opacity: 0.95,
                weight: 5,
              })
              .addTo(map);
          })
          .catch(() => {
            // Keep the approximate path when the routing service is unavailable.
          });
      }

      let activeMarkerElement: HTMLElement | null = null;
      stops.forEach((stop) => {
        const marker = leaflet
          .marker([stop.latitude, stop.longitude], {
            icon: leaflet.divIcon({
              className: "route-leaflet-pin",
              html: `<span data-index="${stop.stopNumber}">${stop.stopNumber}</span>`,
              iconSize: [34, 42],
              iconAnchor: [17, 36],
              popupAnchor: [0, -32],
            }),
          })
          .addTo(map);

        marker.on("click", () => {
          activeMarkerElement?.classList.remove("route-leaflet-pin-active");
          const markerElement = marker.getElement();
          markerElement?.classList.add("route-leaflet-pin-active");
          activeMarkerElement = markerElement || null;
          map.setView([stop.latitude, stop.longitude], Math.max(map.getZoom(), 17), { animate: true });
        });

        marker.bindPopup(
          [
            `<p class="gps-route-popup-kicker">Stop ${stop.stopNumber}</p>`,
            `<p class="gps-route-popup-title">${escapeHtml(stop.shopName)}</p>`,
            `<p class="gps-route-popup-meta">${escapeHtml(formatDateTime(stop.capturedAt))} - ${escapeHtml(stop.area)}</p>`,
            `<a class="gps-route-popup-link" href="${escapeHtml(stop.mapUrl)}" target="_blank" rel="noreferrer">Open in Google Maps</a>`,
          ].join(""),
        );
      });

      cleanup = () => {
        map.remove();
        if (mapRef.current === map) {
          mapRef.current = null;
        }
      };
    }

    void renderMap();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [stops]);

  if (!stops.length) {
    return (
      <div className="flex h-80 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500">
        No GPS points available for map.
      </div>
    );
  }

  return <div ref={mapElementRef} className="h-80 overflow-hidden rounded-md border border-slate-200 lg:h-96" />;
}
