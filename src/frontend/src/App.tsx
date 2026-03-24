import { useCallback, useEffect, useRef, useState } from "react";
import GlobeView, {
  type EqItem,
  type FlightItem,
  type WeatherPoint,
} from "./GlobeView";

// ─── Types ───────────────────────────────────────────────────────────────
type StyleMode = "Normal" | "CRT" | "NVG" | "FLIR" | "Anime" | "Noir" | "Snow";

interface LayerToggles {
  flights: boolean;
  earthquakes: boolean;
  satellites: boolean;
  weather: boolean;
}

interface FeedEvent {
  id: string;
  time: string;
  type: "FLIGHT" | "EQ" | "SAT" | "WEATHER" | "TRAFFIC" | "SYSTEM";
  message: string;
}

// ─── City Data ───────────────────────────────────────────────────────────────
const CITIES: Record<string, { lat: number; lng: number }> = {
  "Washington DC": { lat: 38.9, lng: -77.0 },
  Austin: { lat: 30.2672, lng: -97.7431 },
  "San Francisco": { lat: 37.7749, lng: -122.4194 },
  "New York": { lat: 40.7128, lng: -74.006 },
  Tokyo: { lat: 35.6762, lng: 139.6503 },
  London: { lat: 51.5074, lng: -0.1278 },
  Paris: { lat: 48.8566, lng: 2.3522 },
  Dubai: { lat: 25.2048, lng: 55.2708 },
  Sydney: { lat: -33.8688, lng: 151.2093 },
  "S\u00e3o Paulo": { lat: -23.5505, lng: -46.6333 },
};

const WEATHER_CITIES = [
  // North America
  { city: "New York", lat: 40.71, lon: -74.01 },
  { city: "Los Angeles", lat: 34.05, lon: -118.24 },
  { city: "Chicago", lat: 41.88, lon: -87.63 },
  { city: "Houston", lat: 29.76, lon: -95.37 },
  { city: "Phoenix", lat: 33.45, lon: -112.07 },
  { city: "Philadelphia", lat: 39.95, lon: -75.16 },
  { city: "San Antonio", lat: 29.42, lon: -98.49 },
  { city: "San Diego", lat: 32.72, lon: -117.16 },
  { city: "Dallas", lat: 32.78, lon: -96.8 },
  { city: "San Jose", lat: 37.34, lon: -121.89 },
  { city: "Seattle", lat: 47.61, lon: -122.33 },
  { city: "Denver", lat: 39.74, lon: -104.98 },
  { city: "Boston", lat: 42.36, lon: -71.06 },
  { city: "Miami", lat: 25.77, lon: -80.19 },
  { city: "Atlanta", lat: 33.75, lon: -84.39 },
  { city: "Minneapolis", lat: 44.98, lon: -93.27 },
  { city: "Portland", lat: 45.52, lon: -122.68 },
  { city: "Las Vegas", lat: 36.17, lon: -115.14 },
  { city: "Toronto", lat: 43.65, lon: -79.38 },
  { city: "Montreal", lat: 45.5, lon: -73.57 },
  { city: "Vancouver", lat: 49.25, lon: -123.12 },
  { city: "Calgary", lat: 51.05, lon: -114.07 },
  { city: "Ottawa", lat: 45.42, lon: -75.7 },
  { city: "Edmonton", lat: 53.55, lon: -113.49 },
  { city: "Mexico City", lat: 19.43, lon: -99.13 },
  { city: "Guadalajara", lat: 20.67, lon: -103.35 },
  { city: "Monterrey", lat: 25.67, lon: -100.31 },
  { city: "Puebla", lat: 19.04, lon: -98.2 },
  { city: "Havana", lat: 23.13, lon: -82.38 },
  { city: "Guatemala City", lat: 14.64, lon: -90.51 },
  { city: "San Jose CR", lat: 9.93, lon: -84.08 },
  { city: "Panama City", lat: 8.99, lon: -79.52 },
  { city: "Santo Domingo", lat: 18.47, lon: -69.9 },
  { city: "San Juan", lat: 18.47, lon: -66.12 },
  { city: "Kingston", lat: 17.99, lon: -76.79 },
  // South America
  { city: "Sao Paulo", lat: -23.55, lon: -46.63 },
  { city: "Rio de Janeiro", lat: -22.91, lon: -43.17 },
  { city: "Buenos Aires", lat: -34.61, lon: -58.38 },
  { city: "Lima", lat: -12.05, lon: -77.04 },
  { city: "Bogota", lat: 4.71, lon: -74.07 },
  { city: "Santiago", lat: -33.46, lon: -70.65 },
  { city: "Caracas", lat: 10.48, lon: -66.88 },
  { city: "Montevideo", lat: -34.9, lon: -56.19 },
  { city: "Quito", lat: -0.23, lon: -78.52 },
  { city: "La Paz", lat: -16.5, lon: -68.15 },
  { city: "Asuncion", lat: -25.29, lon: -57.65 },
  { city: "Belo Horizonte", lat: -19.92, lon: -43.94 },
  { city: "Porto Alegre", lat: -30.03, lon: -51.23 },
  { city: "Recife", lat: -8.06, lon: -34.88 },
  { city: "Fortaleza", lat: -3.72, lon: -38.54 },
  { city: "Manaus", lat: -3.1, lon: -60.02 },
  { city: "Medellin", lat: 6.25, lon: -75.57 },
  { city: "Cali", lat: 3.44, lon: -76.52 },
  { city: "Guayaquil", lat: -2.2, lon: -79.9 },
  // Europe
  { city: "London", lat: 51.51, lon: -0.13 },
  { city: "Paris", lat: 48.86, lon: 2.35 },
  { city: "Berlin", lat: 52.52, lon: 13.41 },
  { city: "Madrid", lat: 40.42, lon: -3.7 },
  { city: "Rome", lat: 41.9, lon: 12.5 },
  { city: "Amsterdam", lat: 52.37, lon: 4.9 },
  { city: "Barcelona", lat: 41.39, lon: 2.15 },
  { city: "Vienna", lat: 48.21, lon: 16.37 },
  { city: "Brussels", lat: 50.85, lon: 4.35 },
  { city: "Stockholm", lat: 59.33, lon: 18.07 },
  { city: "Oslo", lat: 59.91, lon: 10.75 },
  { city: "Copenhagen", lat: 55.68, lon: 12.57 },
  { city: "Helsinki", lat: 60.17, lon: 24.94 },
  { city: "Warsaw", lat: 52.23, lon: 21.01 },
  { city: "Prague", lat: 50.08, lon: 14.44 },
  { city: "Budapest", lat: 47.5, lon: 19.04 },
  { city: "Bucharest", lat: 44.43, lon: 26.1 },
  { city: "Athens", lat: 37.98, lon: 23.73 },
  { city: "Lisbon", lat: 38.72, lon: -9.14 },
  { city: "Zurich", lat: 47.38, lon: 8.54 },
  { city: "Dublin", lat: 53.33, lon: -6.25 },
  { city: "Kyiv", lat: 50.45, lon: 30.52 },
  { city: "Istanbul", lat: 41.01, lon: 28.96 },
  { city: "Belgrade", lat: 44.82, lon: 20.46 },
  { city: "Zagreb", lat: 45.81, lon: 15.98 },
  { city: "Sofia", lat: 42.7, lon: 23.32 },
  { city: "Vilnius", lat: 54.69, lon: 25.28 },
  { city: "Riga", lat: 56.95, lon: 24.11 },
  { city: "Tallinn", lat: 59.44, lon: 24.75 },
  { city: "Milan", lat: 45.46, lon: 9.19 },
  { city: "Hamburg", lat: 53.55, lon: 10.0 },
  { city: "Munich", lat: 48.14, lon: 11.58 },
  { city: "Frankfurt", lat: 50.11, lon: 8.68 },
  { city: "Cologne", lat: 50.94, lon: 6.96 },
  { city: "Lyon", lat: 45.75, lon: 4.85 },
  { city: "Marseille", lat: 43.3, lon: 5.38 },
  { city: "Seville", lat: 37.39, lon: -5.99 },
  { city: "Valencia", lat: 39.47, lon: -0.37 },
  { city: "Naples", lat: 40.85, lon: 14.27 },
  { city: "Turin", lat: 45.07, lon: 7.69 },
  { city: "Minsk", lat: 53.9, lon: 27.57 },
  { city: "Chisinau", lat: 47.0, lon: 28.86 },
  { city: "Sarajevo", lat: 43.85, lon: 18.36 },
  { city: "Skopje", lat: 42.0, lon: 21.43 },
  { city: "Tirana", lat: 41.33, lon: 19.83 },
  { city: "Luxembourg", lat: 49.61, lon: 6.13 },
  { city: "Reykjavik", lat: 64.13, lon: -21.82 },
  // Russia & CIS
  { city: "Moscow", lat: 55.75, lon: 37.62 },
  { city: "Saint Petersburg", lat: 59.95, lon: 30.32 },
  { city: "Novosibirsk", lat: 54.99, lon: 82.9 },
  { city: "Yekaterinburg", lat: 56.84, lon: 60.6 },
  { city: "Kazan", lat: 55.79, lon: 49.12 },
  { city: "Almaty", lat: 43.25, lon: 76.96 },
  { city: "Astana", lat: 51.18, lon: 71.45 },
  { city: "Tashkent", lat: 41.3, lon: 69.27 },
  { city: "Baku", lat: 40.41, lon: 49.87 },
  { city: "Tbilisi", lat: 41.69, lon: 44.83 },
  { city: "Yerevan", lat: 40.18, lon: 44.51 },
  { city: "Bishkek", lat: 42.87, lon: 74.59 },
  { city: "Ashgabat", lat: 37.95, lon: 58.38 },
  { city: "Dushanbe", lat: 38.56, lon: 68.77 },
  // Middle East
  { city: "Dubai", lat: 25.2, lon: 55.27 },
  { city: "Abu Dhabi", lat: 24.47, lon: 54.37 },
  { city: "Riyadh", lat: 24.69, lon: 46.72 },
  { city: "Jeddah", lat: 21.54, lon: 39.17 },
  { city: "Kuwait City", lat: 29.37, lon: 47.98 },
  { city: "Doha", lat: 25.29, lon: 51.53 },
  { city: "Manama", lat: 26.22, lon: 50.59 },
  { city: "Muscat", lat: 23.61, lon: 58.59 },
  { city: "Tehran", lat: 35.69, lon: 51.42 },
  { city: "Baghdad", lat: 33.34, lon: 44.4 },
  { city: "Beirut", lat: 33.89, lon: 35.5 },
  { city: "Amman", lat: 31.95, lon: 35.93 },
  { city: "Damascus", lat: 33.51, lon: 36.29 },
  { city: "Jerusalem", lat: 31.77, lon: 35.22 },
  { city: "Tel Aviv", lat: 32.08, lon: 34.78 },
  { city: "Ankara", lat: 39.93, lon: 32.86 },
  { city: "Sanaa", lat: 15.35, lon: 44.21 },
  // South Asia
  { city: "Mumbai", lat: 19.08, lon: 72.88 },
  { city: "Delhi", lat: 28.66, lon: 77.23 },
  { city: "Bangalore", lat: 12.97, lon: 77.59 },
  { city: "Hyderabad", lat: 17.39, lon: 78.49 },
  { city: "Ahmedabad", lat: 23.03, lon: 72.58 },
  { city: "Chennai", lat: 13.08, lon: 80.27 },
  { city: "Kolkata", lat: 22.57, lon: 88.36 },
  { city: "Pune", lat: 18.52, lon: 73.86 },
  { city: "Surat", lat: 21.17, lon: 72.83 },
  { city: "Jaipur", lat: 26.91, lon: 75.79 },
  { city: "Lahore", lat: 31.56, lon: 74.35 },
  { city: "Karachi", lat: 24.86, lon: 67.01 },
  { city: "Islamabad", lat: 33.72, lon: 73.04 },
  { city: "Dhaka", lat: 23.72, lon: 90.41 },
  { city: "Chittagong", lat: 22.33, lon: 91.83 },
  { city: "Colombo", lat: 6.92, lon: 79.85 },
  { city: "Kathmandu", lat: 27.71, lon: 85.31 },
  { city: "Kabul", lat: 34.53, lon: 69.17 },
  // East Asia
  { city: "Beijing", lat: 39.91, lon: 116.39 },
  { city: "Shanghai", lat: 31.23, lon: 121.47 },
  { city: "Guangzhou", lat: 23.13, lon: 113.26 },
  { city: "Shenzhen", lat: 22.54, lon: 114.06 },
  { city: "Chengdu", lat: 30.66, lon: 104.07 },
  { city: "Tianjin", lat: 39.14, lon: 117.18 },
  { city: "Wuhan", lat: 30.58, lon: 114.27 },
  { city: "Chongqing", lat: 29.56, lon: 106.55 },
  { city: "Xian", lat: 34.27, lon: 108.95 },
  { city: "Nanjing", lat: 32.06, lon: 118.78 },
  { city: "Hangzhou", lat: 30.27, lon: 120.15 },
  { city: "Hong Kong", lat: 22.29, lon: 114.16 },
  { city: "Tokyo", lat: 35.68, lon: 139.69 },
  { city: "Osaka", lat: 34.69, lon: 135.5 },
  { city: "Nagoya", lat: 35.18, lon: 136.9 },
  { city: "Sapporo", lat: 43.07, lon: 141.35 },
  { city: "Seoul", lat: 37.57, lon: 126.98 },
  { city: "Busan", lat: 35.1, lon: 129.03 },
  { city: "Taipei", lat: 25.04, lon: 121.56 },
  { city: "Ulaanbaatar", lat: 47.9, lon: 106.88 },
  { city: "Pyongyang", lat: 39.03, lon: 125.75 },
  // Southeast Asia
  { city: "Singapore", lat: 1.35, lon: 103.82 },
  { city: "Jakarta", lat: -6.21, lon: 106.85 },
  { city: "Bangkok", lat: 13.75, lon: 100.52 },
  { city: "Manila", lat: 14.59, lon: 120.98 },
  { city: "Ho Chi Minh City", lat: 10.82, lon: 106.63 },
  { city: "Hanoi", lat: 21.03, lon: 105.85 },
  { city: "Kuala Lumpur", lat: 3.14, lon: 101.69 },
  { city: "Yangon", lat: 16.85, lon: 96.18 },
  { city: "Phnom Penh", lat: 11.57, lon: 104.92 },
  { city: "Vientiane", lat: 17.97, lon: 102.6 },
  { city: "Bandar Seri Begawan", lat: 4.94, lon: 114.94 },
  { city: "Surabaya", lat: -7.25, lon: 112.75 },
  { city: "Medan", lat: 3.58, lon: 98.67 },
  { city: "Bandung", lat: -6.92, lon: 107.61 },
  { city: "Cebu", lat: 10.32, lon: 123.9 },
  // Africa
  { city: "Lagos", lat: 6.46, lon: 3.38 },
  { city: "Cairo", lat: 30.04, lon: 31.24 },
  { city: "Kinshasa", lat: -4.33, lon: 15.32 },
  { city: "Luanda", lat: -8.84, lon: 13.23 },
  { city: "Dar es Salaam", lat: -6.79, lon: 39.21 },
  { city: "Johannesburg", lat: -26.2, lon: 28.04 },
  { city: "Cape Town", lat: -33.93, lon: 18.42 },
  { city: "Abidjan", lat: 5.35, lon: -4.01 },
  { city: "Khartoum", lat: 15.55, lon: 32.53 },
  { city: "Accra", lat: 5.56, lon: -0.2 },
  { city: "Addis Ababa", lat: 9.03, lon: 38.74 },
  { city: "Nairobi", lat: -1.28, lon: 36.82 },
  { city: "Casablanca", lat: 33.59, lon: -7.62 },
  { city: "Algiers", lat: 36.74, lon: 3.06 },
  { city: "Tunis", lat: 36.82, lon: 10.18 },
  { city: "Dakar", lat: 14.69, lon: -17.44 },
  { city: "Antananarivo", lat: -18.91, lon: 47.54 },
  { city: "Kampala", lat: 0.32, lon: 32.58 },
  { city: "Maputo", lat: -25.97, lon: 32.59 },
  { city: "Lusaka", lat: -15.42, lon: 28.28 },
  { city: "Harare", lat: -17.83, lon: 31.05 },
  { city: "Kigali", lat: -1.95, lon: 30.06 },
  { city: "Douala", lat: 4.06, lon: 9.7 },
  { city: "Conakry", lat: 9.54, lon: -13.68 },
  { city: "Bamako", lat: 12.65, lon: -8.0 },
  { city: "Ouagadougou", lat: 12.37, lon: -1.53 },
  { city: "Niamey", lat: 13.51, lon: 2.12 },
  { city: "NDjamena", lat: 12.1, lon: 15.04 },
  { city: "Tripoli", lat: 32.9, lon: 13.18 },
  { city: "Mogadishu", lat: 2.05, lon: 45.34 },
  { city: "Durban", lat: -29.86, lon: 31.02 },
  { city: "Pretoria", lat: -25.75, lon: 28.19 },
  { city: "Brazzaville", lat: -4.27, lon: 15.27 },
  { city: "Abuja", lat: 9.07, lon: 7.4 },
  { city: "Kano", lat: 12.0, lon: 8.52 },
  // Oceania
  { city: "Sydney", lat: -33.87, lon: 151.21 },
  { city: "Melbourne", lat: -37.81, lon: 144.96 },
  { city: "Brisbane", lat: -27.47, lon: 153.02 },
  { city: "Perth", lat: -31.95, lon: 115.86 },
  { city: "Adelaide", lat: -34.93, lon: 138.6 },
  { city: "Auckland", lat: -36.86, lon: 174.77 },
  { city: "Wellington", lat: -41.29, lon: 174.78 },
  { city: "Christchurch", lat: -43.53, lon: 172.63 },
  { city: "Port Moresby", lat: -9.44, lon: 147.18 },
  { city: "Suva", lat: -18.14, lon: 178.44 },
  { city: "Noumea", lat: -22.28, lon: 166.46 },
  { city: "Honolulu", lat: 21.31, lon: -157.86 },
  { city: "Anchorage", lat: 61.22, lon: -149.9 },
];

// ─── Style configs ────────────────────────────────────────────────────────────
const STYLE_CONFIGS: Record<
  StyleMode,
  { filter: string; label: string; color: string }
> = {
  Normal: { filter: "", label: "NORMAL", color: "#00ffff" },
  CRT: {
    filter:
      "contrast(1.4) saturate(0.8) brightness(0.9) sepia(0.15) hue-rotate(90deg)",
    label: "CRT",
    color: "#33ff33",
  },
  NVG: {
    filter:
      "hue-rotate(85deg) saturate(4) brightness(0.85) contrast(1.5) sepia(0.2)",
    label: "NVG",
    color: "#00ff41",
  },
  FLIR: {
    filter:
      "grayscale(1) contrast(2) brightness(1.1) sepia(0.4) hue-rotate(10deg)",
    label: "FLIR",
    color: "#ff6600",
  },
  Anime: {
    filter: "saturate(2.5) contrast(1.4) brightness(1.05) hue-rotate(-10deg)",
    label: "ANIME",
    color: "#ff00ff",
  },
  Noir: {
    filter: "grayscale(1) contrast(2.5) brightness(0.7)",
    label: "NOIR",
    color: "#ffffff",
  },
  Snow: {
    filter: "brightness(2) saturate(0.1) contrast(0.8) hue-rotate(190deg)",
    label: "SNOW",
    color: "#aaddff",
  },
};

// ─── Satellite data ────────────────────────────────────────────────────────────
const STATIC_SATELLITES = [
  { name: "ISS (ZARYA)", lat: 51.6, lng: 10.2, alt: 408 },
  { name: "NOAA-19", lat: 23.4, lng: -45.6, alt: 870 },
  { name: "TERRA", lat: -12.3, lng: 80.1, alt: 705 },
  { name: "AQUA", lat: 34.7, lng: 120.3, alt: 705 },
  { name: "LANDSAT-9", lat: -23.5, lng: -60.8, alt: 705 },
  { name: "SENTINEL-2A", lat: 45.2, lng: 15.4, alt: 786 },
  { name: "SENTINEL-2B", lat: 60.1, lng: -20.3, alt: 786 },
  { name: "WORLDVIEW-3", lat: -5.6, lng: 40.2, alt: 617 },
  { name: "PLEIADES-1A", lat: 28.9, lng: -70.1, alt: 694 },
  { name: "SPOT-7", lat: -35.4, lng: 145.6, alt: 694 },
  { name: "GOES-18", lat: 0.0, lng: -137.0, alt: 35786 },
  { name: "GOES-16", lat: 0.0, lng: -75.2, alt: 35786 },
  { name: "METEOSAT-11", lat: 0.0, lng: 0.0, alt: 35786 },
  { name: "GPS IIF-1", lat: 55.0, lng: 30.0, alt: 20200 },
  { name: "GPS IIF-3", lat: -55.0, lng: -90.0, alt: 20200 },
  { name: "GLONASS-M", lat: 64.5, lng: 60.0, alt: 19140 },
  { name: "IRIDIUM-140", lat: 72.0, lng: -20.0, alt: 780 },
  { name: "STARLINK-1007", lat: 53.0, lng: -110.0, alt: 550 },
  { name: "STARLINK-1008", lat: -53.0, lng: 160.0, alt: 550 },
  { name: "INTELSAT-33E", lat: 0.0, lng: 60.0, alt: 35786 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function toDMS(deg: number, isLat: boolean): string {
  const dir = isLat ? (deg >= 0 ? "N" : "S") : deg >= 0 ? "E" : "W";
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const mFull = (abs - d) * 60;
  const m = Math.floor(mFull);
  const s = ((mFull - m) * 60).toFixed(2);
  return `${String(d).padStart(isLat ? 2 : 3, "0")}°${String(m).padStart(2, "0")}'${String(s).padStart(5, "0")}"${dir}`;
}

function getGSD(dist: number): string {
  const gsd = dist * 1000;
  return gsd < 10 ? gsd.toFixed(1) : Math.round(gsd).toString();
}

function getNIIRS(dist: number): string {
  const niirs = Math.min(9, Math.max(0, (4.0 - dist) * 4));
  return niirs.toFixed(1);
}

function getMGRS(lat: number, lng: number): string {
  const zone = Math.floor((lng + 180) / 6) + 1;
  const band = "CDEFGHJKLMNPQRSTUVWX"[Math.min(19, Math.floor((lat + 80) / 8))];
  const e = Math.abs(Math.round((lng % 6) * 10000));
  const n = Math.abs(Math.round((lat % 8) * 10000));
  return `${zone}${band} ${String(e % 100).padStart(2, "0")}${String(n % 100).padStart(2, "0")} ${String(e % 10000).padStart(4, "0")} ${String(n % 10000).padStart(4, "0")}`;
}

function getStorage<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

function nowHHMMSS(): string {
  return new Date().toISOString().slice(11, 19);
}

function weatherCodeToLabel(code: number): string {
  if (code === 0) return "CLR";
  if (code <= 3) return "CLDS";
  if (code <= 12) return "MIST";
  if (code <= 29) return "FOG";
  if (code <= 39) return "DRZL";
  if (code <= 49) return "DRZL";
  if (code <= 59) return "RAIN";
  if (code <= 69) return "SNOW";
  if (code <= 79) return "SLEET";
  if (code <= 84) return "SHWR";
  if (code <= 94) return "THDR";
  return "HAIL";
}

function getOrbitType(alt: number): string {
  if (alt < 2000) return "LEO";
  if (alt < 20000) return "MEO";
  return "GEO";
}

function getPeriod(alt: number): string {
  const r = 6371 + alt;
  const T = (2 * Math.PI * Math.sqrt((r * r * r) / 3.986e14)) / 60;
  return T.toFixed(0);
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "3px 8px",
    fontSize: 8,
    cursor: "pointer",
    fontFamily: "monospace",
    letterSpacing: "0.08em",
    background: active ? "rgba(0,255,255,0.15)" : "rgba(0,0,0,0.4)",
    border: `1px solid ${active ? "#00ffff" : "rgba(0,255,255,0.2)"}`,
    color: active ? "#00ffff" : "rgba(0,255,255,0.3)",
  };
}

// ─── HUD Detail Panel ────────────────────────────────────────────────────────────
function DetailPanel({
  title,
  accent,
  rows,
  onClose,
}: {
  title: string;
  accent: string;
  rows: Array<[string, string]>;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        background: "rgba(0,0,0,0.92)",
        border: `1px solid ${accent}55`,
        padding: "10px 14px",
        fontFamily: "monospace",
        fontSize: 9,
        minWidth: 200,
        maxWidth: 260,
        color: accent,
        boxShadow: `0 0 18px ${accent}22`,
      }}
    >
      <div
        style={{
          color: accent,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          marginBottom: 6,
          borderBottom: `1px solid ${accent}33`,
          paddingBottom: 4,
        }}
      >
        {title}
      </div>
      {rows.map(([k, v]) => (
        <div
          key={k}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            padding: "2px 0",
            borderBottom: `1px solid ${accent}11`,
          }}
        >
          <span style={{ color: `${accent}99`, whiteSpace: "nowrap" }}>
            {k}
          </span>
          <span style={{ color: accent, textAlign: "right" }}>{v}</span>
        </div>
      ))}
      <button
        type="button"
        onClick={onClose}
        style={{
          marginTop: 8,
          padding: "2px 12px",
          fontSize: 8,
          background: `${accent}18`,
          border: `1px solid ${accent}66`,
          color: accent,
          cursor: "pointer",
          fontFamily: "monospace",
          letterSpacing: "0.1em",
          width: "100%",
        }}
      >
        CLOSE
      </button>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────────
function dateToGoesTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 0);
  const diff = date.getTime() - start;
  const dayOfYear = Math.floor(diff / 86400000);
  const ddd = String(dayOfYear).padStart(3, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const rawMin = date.getUTCMinutes();
  const mm = String(Math.floor(rawMin / 10) * 10).padStart(2, "0");
  return `${year}${ddd}${hh}${mm}`;
}

export default function App() {
  const [activeStyle, setActiveStyleRaw] = useState<StyleMode>(() =>
    getStorage<StyleMode>("cerebro_style", "Normal"),
  );
  const [hudVisible, setHudVisible] = useState(() =>
    getStorage("cerebro_hud", true),
  );
  const [layers, setLayers] = useState<LayerToggles>(() =>
    getStorage("cerebro_layers", {
      flights: true,
      earthquakes: true,
      satellites: true,
      weather: false,
    }),
  );
  const [bloom, setBloom] = useState({ active: true, value: 50 });
  const [sharpen, setSharpen] = useState({ active: true, value: 56 });
  const [activeCity, setActiveCity] = useState(() =>
    getStorage("cerebro_city", "Washington DC"),
  );
  // targetCenter drives GlobeView camera fly-to
  const [targetCenter, setTargetCenter] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const [mapCenter, setMapCenter] = useState({ lat: 38.9, lng: -77.0 });
  const [globeZoomDist, setGlobeZoomDist] = useState(2.5);
  const [showFlightLabels, setShowFlightLabels] = useState(true);
  const [showCityLabels, setShowCityLabels] = useState(true);
  const [flightSampleRate, setFlightSampleRate] = useState(0.1);
  const [utcTime, setUtcTime] = useState("");
  const [flightCount, setFlightCount] = useState(0);
  const [eqCount, setEqCount] = useState(0);
  const [satCount] = useState(20);
  const [cctvExpanded, setCctvExpanded] = useState(true);
  const [feedExpanded, setFeedExpanded] = useState(true);
  const [lastFlightUpdate, setLastFlightUpdate] = useState("never");
  const [lastEqUpdate, setLastEqUpdate] = useState("never");
  const [lastWeatherUpdate, setLastWeatherUpdate] = useState("never");
  // Keyed by timestamp string so order is always chronological regardless of fetch result order
  const [goes19FrameMap, setGoes19FrameMap] = useState<Map<string, string>>(
    new Map(),
  );
  const [goes19FrameIdx, setGoes19FrameIdx] = useState(0);
  const [goes19Loading, setGoes19Loading] = useState(false);

  // Sorted array derived from map — always chronological by timestamp key
  const goes19Frames: string[] = Array.from(goes19FrameMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, url]) => url);

  // Globe data
  const [globeFlights, setGlobeFlights] = useState<FlightItem[]>([]);
  const [globeEqs, setGlobeEqs] = useState<EqItem[]>([]);
  const [weatherData, setWeatherData] = useState<WeatherPoint[]>([]);

  // Selected items (detail panels rendered OUTSIDE the circular clip)
  const [selectedSat, setSelectedSat] = useState<string | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<FlightItem | null>(null);
  const [selectedEq, setSelectedEq] = useState<EqItem | null>(null);

  // Sidebar collapse state
  const [leftCollapsed, setLeftCollapsed] = useState(() => {
    const saved = localStorage.getItem("cerebro_left_collapsed");
    if (saved !== null) return JSON.parse(saved) as boolean;
    return window.innerWidth < 768;
  });
  const [rightCollapsed, setRightCollapsed] = useState(() => {
    const saved = localStorage.getItem("cerebro_right_collapsed");
    if (saved !== null) return JSON.parse(saved) as boolean;
    return window.innerWidth < 768;
  });

  // Live feed events
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const feedIdRef = useRef(0);

  const addFeed = useCallback((type: FeedEvent["type"], message: string) => {
    const id = String(++feedIdRef.current);
    setFeedEvents((prev) => [
      { id, time: nowHHMMSS(), type, message },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const setActiveStyle = useCallback((s: StyleMode) => {
    setActiveStyleRaw(s);
    setStorage("cerebro_style", s);
  }, []);

  // ── Landscape auto-collapse ──
  useEffect(() => {
    const checkOrientation = () => {
      if (window.innerWidth > window.innerHeight && window.innerWidth < 900) {
        setLeftCollapsed(true);
        setRightCollapsed(true);
      }
    };
    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);
    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  // ── UTC Clock ──
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setUtcTime(`${now.toISOString().replace("T", " ").slice(0, 19)} UTC`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch flights ──
  const fetchFlights = useCallback(async () => {
    const OPENSKY_URL = "https://opensky-network.org/api/states/all";
    const PROXY_URL = `https://api.allorigins.win/raw?url=${encodeURIComponent(OPENSKY_URL)}`;

    let data: { states?: unknown[][] } | null = null;

    try {
      const r = await fetch(OPENSKY_URL);
      if (r.ok) {
        data = (await r.json()) as { states?: unknown[][] };
      } else {
        // Rate limited — try proxy
        addFeed("SYSTEM", "OpenSky rate-limited, trying proxy...");
        const r2 = await fetch(PROXY_URL);
        if (r2.ok) data = (await r2.json()) as { states?: unknown[][] };
      }
    } catch {
      try {
        const r2 = await fetch(PROXY_URL);
        if (r2.ok) data = (await r2.json()) as { states?: unknown[][] };
      } catch {
        // both failed
      }
    }

    if (!data) {
      setLastFlightUpdate("failed");
      addFeed("SYSTEM", "Flight feed unavailable — rate limited");
      return;
    }

    const states = data.states || [];
    const arr: FlightItem[] = [];
    for (const s of states) {
      const row = s as unknown[];
      const lat = row[6] as number | null;
      const lon = row[5] as number | null;
      if (!lat || !lon) continue;
      const callsign = ((row[1] as string | null) || "N/A").trim();
      const icao24 = ((row[0] as string | null) || "").trim();
      const originCountry = ((row[2] as string | null) || "").trim();
      const alt = row[7] ? Math.round(row[7] as number) : 0;
      const geoAlt = row[13] ? Math.round(row[13] as number) : alt;
      const vel = row[9] ? Math.round((row[9] as number) * 1.944) : 0; // m/s to knots
      const hdg = row[10] != null ? Math.round(row[10] as number) : 0;
      const vertRate = row[11] ? Math.round((row[11] as number) * 196.85) : 0; // m/s to ft/min
      const squawk = ((row[14] as string | null) || "").trim();
      if (row[8]) continue; // on ground
      arr.push({
        lat,
        lon,
        callsign,
        icao24,
        originCountry,
        alt,
        geoAlt,
        vel,
        hdg,
        vertRate,
        squawk,
      });
    }
    setGlobeFlights(arr);
    setFlightCount(arr.length);
    setLastFlightUpdate(new Date().toLocaleTimeString());
    addFeed("FLIGHT", `Updated ${arr.length} aircraft tracks`);
  }, [addFeed]);

  // ── Fetch earthquakes ──
  const fetchEarthquakes = useCallback(async () => {
    try {
      const r = await fetch(
        "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
      );
      const data = (await r.json()) as {
        features: Array<{
          geometry: { coordinates: number[] };
          properties: { mag: number; place: string; time: number };
        }>;
      };
      const arr: EqItem[] = data.features.map((f) => ({
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        mag: f.properties.mag,
        place: f.properties.place,
      }));
      setGlobeEqs(arr);
      setEqCount(arr.length);
      setLastEqUpdate(new Date().toLocaleTimeString());
      const big = arr.filter((e) => e.mag >= 4);
      if (big.length > 0) {
        addFeed("EQ", `M${big[0].mag.toFixed(1)} near ${big[0].place}`);
      } else {
        addFeed("EQ", `${arr.length} seismic events in last 24h`);
      }
    } catch {
      setLastEqUpdate("failed");
    }
  }, [addFeed]);

  // ── Fetch weather ──
  const fetchWeather = useCallback(async () => {
    try {
      const lats = WEATHER_CITIES.map((c) => c.lat).join(",");
      const lons = WEATHER_CITIES.map((c) => c.lon).join(",");
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current_weather=true&timezone=auto`;
      const r = await fetch(url);
      const raw = await r.json();
      const results: unknown[] = Array.isArray(raw) ? raw : [raw];
      const points: WeatherPoint[] = results.map((res, i) => {
        const r2 = res as {
          current_weather?: {
            temperature: number;
            windspeed: number;
            weathercode: number;
          };
        };
        return {
          lat: WEATHER_CITIES[i].lat,
          lon: WEATHER_CITIES[i].lon,
          city: WEATHER_CITIES[i].city,
          temp: r2.current_weather?.temperature ?? 0,
          windspeed: r2.current_weather?.windspeed ?? 0,
          weathercode: r2.current_weather?.weathercode ?? 0,
        };
      });
      setWeatherData(points);
      setLastWeatherUpdate(new Date().toLocaleTimeString());
      const sorted = [...points].sort((a, b) => a.temp - b.temp);
      addFeed(
        "WEATHER",
        `${sorted[0].city} ${sorted[0].temp.toFixed(0)}\u00b0C | ${sorted[sorted.length - 1].city} ${sorted[sorted.length - 1].temp.toFixed(0)}\u00b0C`,
      );
    } catch {
      setLastWeatherUpdate("failed");
      addFeed("WEATHER", "Weather feed unavailable");
    }
  }, [addFeed]);

  useEffect(() => {
    addFeed("SYSTEM", "CEREBRO INTELLIGENCE PLATFORM ONLINE");
    addFeed("SYSTEM", "Initializing all data feeds...");
    const t = setTimeout(() => {
      fetchFlights();
      fetchEarthquakes();
      fetchWeather();
    }, 600);
    const flightInterval = setInterval(fetchFlights, 90_000);
    const eqInterval = setInterval(fetchEarthquakes, 120_000);
    const weatherInterval = setInterval(fetchWeather, 300_000);
    return () => {
      clearTimeout(t);
      clearInterval(flightInterval);
      clearInterval(eqInterval);
      clearInterval(weatherInterval);
    };
  }, [fetchFlights, fetchEarthquakes, fetchWeather, addFeed]);

  const toggleLayer = useCallback((name: keyof LayerToggles) => {
    setLayers((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      setStorage("cerebro_layers", next);
      return next;
    });
  }, []);

  const mapStyle = STYLE_CONFIGS[activeStyle];

  // ── Load GOES-19 frames on mount ──
  useEffect(() => {
    let cancelled = false;
    const tryLoad = (url: string): Promise<string | null> =>
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(url);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    const load = async () => {
      setGoes19Loading(true);
      const now = new Date();
      // Pre-generate all 144 timestamps oldest→newest (24h × 6 per hour) so insertion key order is known upfront
      const timestamps: string[] = [];
      for (let i = 143; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 10 * 60 * 1000);
        timestamps.push(dateToGoesTimestamp(d));
      }
      for (const ts of timestamps) {
        if (cancelled) break;
        const url = `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/${ts}_GOES19-ABI-FD-GEOCOLOR-678x678.jpg`;
        const loaded = await tryLoad(url);
        if (loaded && !cancelled) {
          setGoes19FrameMap((prev) => {
            const next = new Map(prev);
            next.set(ts, loaded);
            return next;
          });
        }
      }
      if (!cancelled) setGoes19Loading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Animation loop ──
  useEffect(() => {
    const id = setInterval(() => {
      setGoes19FrameMap((frameMap) => {
        const len = frameMap.size;
        if (len > 0) setGoes19FrameIdx((idx) => (idx + 1) % len);
        return frameMap;
      });
    }, 150);
    return () => clearInterval(id);
  }, []);

  // ── Real-time new frame every 10 minutes ──
  useEffect(() => {
    const tryLoad = (url: string): Promise<string | null> =>
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(url);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    const id = setInterval(
      async () => {
        const now = new Date();
        const ts = dateToGoesTimestamp(now);
        const url = `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/${ts}_GOES19-ABI-FD-GEOCOLOR-678x678.jpg`;
        const loaded = await tryLoad(url);
        if (loaded) {
          setGoes19FrameMap((prev) => {
            if (prev.has(ts)) return prev;
            const next = new Map(prev);
            next.set(ts, loaded);
            // Keep max 144 frames — drop oldest by timestamp key
            if (next.size > 144) {
              const oldest = Array.from(next.keys()).sort()[0];
              next.delete(oldest);
            }
            return next;
          });
        }
      },
      10 * 60 * 1000,
    );
    return () => clearInterval(id);
  }, []);

  const feedTypeColor = {
    FLIGHT: "#00ffff",
    EQ: "#ff4400",
    SAT: "#ff6600",
    WEATHER: "#aaddff",
    TRAFFIC: "#ffcc00",
    SYSTEM: "rgba(0,255,255,0.4)",
  };

  // Selected satellite data
  const selectedSatData = selectedSat
    ? STATIC_SATELLITES.find((s) => s.name === selectedSat)
    : null;

  // Globe container: always a perfect circle using CSS min()
  // Compute globe-only filter with bloom/sharpen
  const bloomExtra =
    bloom.active && bloom.value > 0
      ? `brightness(${1 + bloom.value / 300}) saturate(${1 + bloom.value / 200})`
      : "";
  const sharpenExtra =
    sharpen.active && sharpen.value > 0
      ? `contrast(${1 + sharpen.value / 150})`
      : "";
  const globeFilter = [mapStyle.filter, bloomExtra, sharpenExtra]
    .filter(Boolean)
    .join(" ");
  const leftW = leftCollapsed ? 0 : 270;
  const rightW = rightCollapsed ? 0 : 260;
  const globeSize = `min(calc(100vw - ${leftW}px - ${rightW}px), 90dvh)`;

  return (
    <div
      style={{
        width: "100vw",
        height: "100dvh",
        background: "#000",
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "row",
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {/* ── Sidebar Toggle Buttons (outside sidebars so never clipped) ── */}
      <button
        type="button"
        data-ocid="sidebar.left.toggle"
        onClick={() => {
          const next = !leftCollapsed;
          setLeftCollapsed(next);
          localStorage.setItem("cerebro_left_collapsed", JSON.stringify(next));
        }}
        style={{
          position: "absolute",
          left: leftCollapsed ? 0 : 270,
          top: "50%",
          transform: "translateY(-50%)",
          width: 20,
          height: 40,
          background: "rgba(0,0,0,0.88)",
          border: "1px solid rgba(0,255,255,0.2)",
          borderLeft: "none",
          borderRadius: "0 4px 4px 0",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 950,
          color: "rgba(0,255,255,0.7)",
          fontSize: 10,
          padding: 0,
          transition: "left 0.3s ease",
        }}
        title={leftCollapsed ? "Expand" : "Collapse"}
      >
        {leftCollapsed ? "›" : "‹"}
      </button>
      <button
        type="button"
        data-ocid="sidebar.right.toggle"
        onClick={() => {
          const next = !rightCollapsed;
          setRightCollapsed(next);
          localStorage.setItem("cerebro_right_collapsed", JSON.stringify(next));
        }}
        style={{
          position: "absolute",
          right: rightCollapsed ? 0 : 260,
          top: "50%",
          transform: "translateY(-50%)",
          width: 20,
          height: 40,
          background: "rgba(0,0,0,0.88)",
          border: "1px solid rgba(0,255,255,0.2)",
          borderRight: "none",
          borderRadius: "4px 0 0 4px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 950,
          color: "rgba(0,255,255,0.7)",
          fontSize: 10,
          padding: 0,
          transition: "right 0.3s ease",
        }}
        title={rightCollapsed ? "Expand" : "Collapse"}
      >
        {rightCollapsed ? "‹" : "›"}
      </button>

      {/* ── Left Sidebar ── */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: leftCollapsed ? 0 : 270,
          background: "rgba(0,0,0,0.88)",
          borderRight: leftCollapsed
            ? "none"
            : "1px solid rgba(0,255,255,0.12)",
          zIndex: 900,
          overflowY: leftCollapsed ? "hidden" : "auto",
          overflowX: "hidden",
          transition: "width 0.3s ease",
          flexShrink: 0,
          pointerEvents: leftCollapsed ? "none" : "auto",
        }}
      >
        {/* CEREBRO title */}
        <div
          style={{
            padding: "10px 12px 6px",
            borderBottom: "1px solid rgba(0,255,255,0.1)",
          }}
        >
          <div
            style={{
              color: "#00ffff",
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.2em",
            }}
          >
            CEREBRO
          </div>
          <div
            style={{
              color: "rgba(0,255,255,0.4)",
              fontSize: 8,
              letterSpacing: "0.15em",
            }}
          >
            GLOBAL INTELLIGENCE PLATFORM
          </div>
        </div>

        {/* SATELLITE IMAGE */}
        <div style={{ borderBottom: "1px solid rgba(0,255,255,0.08)" }}>
          <button
            type="button"
            onClick={() => setCctvExpanded((e) => !e)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "7px 12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(0,255,255,0.7)",
              fontSize: 9,
              letterSpacing: "0.12em",
            }}
          >
            <span>▶ PAST SATELLITE IMAGE 24H LOOP</span>
            <span style={{ color: "rgba(0,255,255,0.4)" }}>
              {cctvExpanded ? "−" : "+"}
            </span>
          </button>
          {cctvExpanded && (
            <div style={{ padding: "4px 10px 10px" }}>
              <div
                style={{
                  background: "rgba(0,255,255,0.03)",
                  border: "1px solid rgba(0,255,255,0.15)",
                  padding: 4,
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    paddingBottom: "100%",
                    overflow: "hidden",
                    marginBottom: 4,
                    background: "#000",
                  }}
                >
                  {goes19Frames.length > 0 && (
                    <img
                      src={goes19Frames[goes19FrameIdx]}
                      alt="GOES-19 satellite animation frame"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        opacity: 0.95,
                      }}
                    />
                  )}
                  {goes19Frames.length === 0 && !goes19Loading && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "rgba(255,80,80,0.8)",
                        fontSize: 8,
                        fontFamily: "monospace",
                        background: "rgba(0,0,0,0.7)",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <span>⚠ FEED UNAVAILABLE</span>
                      <span style={{ opacity: 0.5 }}>CHECK NETWORK</span>
                    </div>
                  )}
                  {goes19Loading && goes19Frames.length === 0 && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "rgba(0,255,255,0.7)",
                        fontSize: 8,
                        fontFamily: "monospace",
                        background: "rgba(0,0,0,0.85)",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <span>⟳ LOADING FRAMES...</span>
                    </div>
                  )}
                  <div
                    style={{
                      position: "absolute",
                      top: 2,
                      left: 4,
                      color: "#ff9900",
                      fontSize: 7,
                      fontFamily: "monospace",
                      pointerEvents: "none",
                    }}
                  >
                    ● ANIM
                  </div>
                  {goes19Loading && (
                    <div
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 4,
                        color: "rgba(0,255,255,0.6)",
                        fontSize: 6,
                        fontFamily: "monospace",
                        pointerEvents: "none",
                      }}
                    >
                      {goes19Frames.length}/72
                    </div>
                  )}
                  {goes19Frames.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 4,
                        color: "rgba(0,255,255,0.5)",
                        fontSize: 6,
                        fontFamily: "monospace",
                        pointerEvents: "none",
                      }}
                    >
                      {goes19FrameIdx + 1}/{goes19Frames.length}
                    </div>
                  )}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 2,
                      right: 4,
                      color: "rgba(0,255,255,0.5)",
                      fontSize: 6,
                      fontFamily: "monospace",
                    }}
                  >
                    {utcTime.slice(11, 19)}
                  </div>
                </div>
                <div style={{ color: "#00ffff", fontSize: 8 }}>
                  GOES-19 GEOCOLOR — 24H LOOP
                </div>
                <div
                  style={{
                    color: "rgba(0,255,255,0.4)",
                    fontSize: 7,
                    marginTop: 2,
                  }}
                >
                  10-MIN CADENCE · NESDIS
                </div>
              </div>
            </div>
          )}
        </div>

        {/* DATA LAYERS */}
        <div
          style={{
            padding: "6px 12px 10px",
            borderBottom: "1px solid rgba(0,255,255,0.08)",
          }}
        >
          <div
            style={{
              color: "rgba(0,255,255,0.5)",
              fontSize: 8,
              letterSpacing: "0.15em",
              marginBottom: 6,
            }}
          >
            ▶ DATA LAYERS
          </div>
          {(
            [
              {
                key: "flights",
                icon: "✈",
                label: "LIVE FLIGHTS",
                count: flightCount,
                update: lastFlightUpdate,
                ocid: "layers.flights.toggle",
              },
              {
                key: "earthquakes",
                icon: "⊕",
                label: "EARTHQUAKES 24H",
                count: eqCount,
                update: lastEqUpdate,
                ocid: "layers.earthquakes.toggle",
              },
              {
                key: "satellites",
                icon: "◆",
                label: "SATELLITES",
                count: satCount,
                update: "auto",
                ocid: "layers.satellites.toggle",
              },
              {
                key: "weather",
                icon: "☁",
                label: "WEATHER RADAR",
                count: weatherData.length,
                update: lastWeatherUpdate,
                ocid: "layers.weather.toggle",
              },
            ] as Array<{
              key: keyof LayerToggles;
              icon: string;
              label: string;
              count: number;
              update: string;
              ocid: string;
            }>
          ).map((layer) => (
            <div key={`wrapper-${layer.key}`} style={{ display: "contents" }}>
              <div
                key={layer.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 0",
                  borderBottom: "1px solid rgba(0,255,255,0.04)",
                }}
              >
                <span
                  style={{
                    color: layers[layer.key]
                      ? "#00ffff"
                      : "rgba(0,255,255,0.3)",
                    fontSize: 11,
                    width: 14,
                  }}
                >
                  {layer.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: layers[layer.key]
                        ? "#00ffff"
                        : "rgba(0,255,255,0.3)",
                      fontSize: 8,
                    }}
                  >
                    {layer.label}
                  </div>
                  <div style={{ color: "rgba(0,255,255,0.3)", fontSize: 7 }}>
                    UPD: {layer.update}
                  </div>
                </div>
                <span
                  style={{
                    color: layers[layer.key]
                      ? "#00ffff"
                      : "rgba(0,255,255,0.25)",
                    fontSize: 8,
                    minWidth: 24,
                    textAlign: "right",
                  }}
                >
                  {layer.count > 0 ? layer.count : "–"}
                </span>
                <button
                  type="button"
                  data-ocid={layer.ocid}
                  onClick={() => toggleLayer(layer.key)}
                  style={{
                    padding: "2px 5px",
                    fontSize: 7,
                    cursor: "pointer",
                    fontFamily: "monospace",
                    background: layers[layer.key]
                      ? "rgba(0,255,255,0.2)"
                      : "rgba(0,0,0,0.4)",
                    border: `1px solid ${
                      layers[layer.key] ? "#00ffff" : "rgba(0,255,255,0.2)"
                    }`,
                    color: layers[layer.key]
                      ? "#00ffff"
                      : "rgba(0,255,255,0.3)",
                  }}
                >
                  {layers[layer.key] ? "ON" : "OFF"}
                </button>
              </div>
              {/* Flight sample rate sub-row */}
              {layer.key === "flights" && layers.flights && (
                <div
                  style={{
                    padding: "4px 0 4px 20px",
                    borderBottom: "1px solid rgba(0,255,255,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        color: "rgba(0,255,255,0.5)",
                        fontSize: 7,
                        fontFamily: "monospace",
                        letterSpacing: "0.1em",
                      }}
                    >
                      ✈ SAMPLE RATE
                    </span>
                    <span
                      style={{
                        color: "#00ffff",
                        fontSize: 8,
                        fontFamily: "monospace",
                      }}
                    >
                      {Math.round(flightSampleRate * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    data-ocid="flights.sample.toggle"
                    min={1}
                    max={100}
                    value={Math.round(flightSampleRate * 100)}
                    onChange={(e) => setFlightSampleRate(+e.target.value / 100)}
                    className="cerebro-slider"
                    style={{ width: "100%" }}
                  />
                  <div
                    style={{
                      color: "rgba(0,255,255,0.3)",
                      fontSize: 6,
                      fontFamily: "monospace",
                      marginTop: 2,
                    }}
                  >
                    {Math.max(
                      1,
                      Math.round(globeFlights.length * flightSampleRate),
                    )}{" "}
                    / {globeFlights.length} FLIGHTS
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* LIVE FEED */}
        <div style={{ borderBottom: "1px solid rgba(0,255,255,0.08)" }}>
          <button
            type="button"
            onClick={() => setFeedExpanded((e) => !e)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "7px 12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(0,255,255,0.7)",
              fontSize: 9,
              letterSpacing: "0.12em",
            }}
          >
            <span>▶ LIVE FEED</span>
            <span style={{ color: "#ff3333", fontSize: 7 }}>
              ● {feedExpanded ? "−" : "+"}
            </span>
          </button>
          {feedExpanded && (
            <div
              style={{
                maxHeight: 160,
                overflowY: "auto",
                padding: "0 10px 8px",
              }}
            >
              {feedEvents.length === 0 && (
                <div
                  style={{
                    color: "rgba(0,255,255,0.3)",
                    fontSize: 8,
                    padding: "4px 0",
                  }}
                >
                  Waiting for data...
                </div>
              )}
              {feedEvents.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    gap: 5,
                    padding: "2px 0",
                    borderBottom: "1px solid rgba(0,255,255,0.04)",
                  }}
                >
                  <span
                    style={{
                      color: "rgba(0,255,255,0.3)",
                      fontSize: 6,
                      whiteSpace: "nowrap",
                      paddingTop: 1,
                      minWidth: 44,
                    }}
                  >
                    {ev.time}
                  </span>
                  <span
                    style={{
                      color: feedTypeColor[ev.type],
                      fontSize: 7,
                      minWidth: 40,
                    }}
                  >
                    [{ev.type}]
                  </span>
                  <span
                    style={{
                      color: "rgba(0,255,255,0.7)",
                      fontSize: 7,
                      flex: 1,
                      lineHeight: 1.3,
                    }}
                  >
                    {ev.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 12px",
            color: "rgba(0,255,255,0.2)",
            fontSize: 7,
          }}
        >
          © {new Date().getFullYear()} · BUILT WITH{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "rgba(0,255,255,0.4)", textDecoration: "none" }}
          >
            CAFFEINE.AI
          </a>
        </div>
      </div>

      {/* ── Center Section ── */}
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* ── Globe ── */}
        <div
          style={{
            width: globeSize,
            height: globeSize,
            borderRadius: "50%",
            overflow: "hidden",
            boxShadow: "none",
            zIndex: 100,
            filter: globeFilter || undefined,
            transition: "filter 0.5s ease",
          }}
          data-ocid="map.canvas_target"
        >
          <GlobeView
            flightData={(() => {
              const sorted = [...globeFlights].sort((a, b) =>
                a.icao24 < b.icao24 ? -1 : a.icao24 > b.icao24 ? 1 : 0,
              );
              const n = Math.max(
                1,
                Math.round(sorted.length * flightSampleRate),
              );
              return sorted.slice(0, n);
            })()}
            eqData={globeEqs}
            satData={STATIC_SATELLITES}
            weatherData={weatherData}
            layers={layers}
            globeCenter={mapCenter}
            targetCenter={targetCenter}
            selectedSat={selectedSat}
            selectedFlight={selectedFlight}
            onSatelliteClick={(name) => {
              setSelectedSat(name);
              setSelectedEq(null);
              if (name) addFeed("SAT", `Selected satellite: ${name}`);
            }}
            onFlightClick={(f) => {
              setSelectedFlight(f);
              setSelectedSat(null);
              setSelectedEq(null);
              addFeed("FLIGHT", `Selected flight: ${f.callsign}`);
            }}
            onEarthquakeClick={(eq) => {
              setSelectedEq(eq);
              setSelectedFlight(null);
              setSelectedSat(null);
              addFeed("EQ", `Selected: M${eq.mag.toFixed(1)} ${eq.place}`);
            }}
            onCenterChange={(lat, lng) => setMapCenter({ lat, lng })}
            onZoomChange={setGlobeZoomDist}
            showFlightLabels={showFlightLabels}
            showCityLabels={showCityLabels}
            cityData={Object.entries(CITIES).map(([name, c]) => ({
              name,
              lat: c.lat,
              lng: c.lng,
            }))}
            onCityClick={(name, lat, lng) => {
              setActiveCity(name);
              setStorage("cerebro_city", name);
              setTargetCenter({ lat, lng });
              addFeed("SYSTEM", `Navigating to ${name}`);
            }}
          />
          {/* Vignette */}
          <div className="map-vignette" />
          {/* Center reticle */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              zIndex: 600,
              animation: "reticle-pulse 3s ease-in-out infinite",
            }}
          >
            <svg
              width="60"
              height="60"
              viewBox="0 0 60 60"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>Tactical Reticle</title>
              {/* Top-left bracket */}
              <path
                d="M4 16 L4 4 L16 4"
                stroke="rgba(0,255,255,0.75)"
                strokeWidth="1.2"
                fill="none"
                strokeLinecap="square"
              />
              {/* Top-right bracket */}
              <path
                d="M44 4 L56 4 L56 16"
                stroke="rgba(0,255,255,0.75)"
                strokeWidth="1.2"
                fill="none"
                strokeLinecap="square"
              />
              {/* Bottom-left bracket */}
              <path
                d="M4 44 L4 56 L16 56"
                stroke="rgba(0,255,255,0.75)"
                strokeWidth="1.2"
                fill="none"
                strokeLinecap="square"
              />
              {/* Bottom-right bracket */}
              <path
                d="M56 44 L56 56 L44 56"
                stroke="rgba(0,255,255,0.75)"
                strokeWidth="1.2"
                fill="none"
                strokeLinecap="square"
              />
              {/* Center cross */}
              <line
                x1="30"
                y1="26"
                x2="30"
                y2="22"
                stroke="rgba(0,255,255,0.9)"
                strokeWidth="1"
                strokeLinecap="square"
              />
              <line
                x1="30"
                y1="34"
                x2="30"
                y2="38"
                stroke="rgba(0,255,255,0.9)"
                strokeWidth="1"
                strokeLinecap="square"
              />
              <line
                x1="26"
                y1="30"
                x2="22"
                y2="30"
                stroke="rgba(0,255,255,0.9)"
                strokeWidth="1"
                strokeLinecap="square"
              />
              <line
                x1="34"
                y1="30"
                x2="38"
                y2="30"
                stroke="rgba(0,255,255,0.9)"
                strokeWidth="1"
                strokeLinecap="square"
              />
              {/* Center dot */}
              <rect
                x="29"
                y="29"
                width="2"
                height="2"
                fill="rgba(0,255,255,0.95)"
              />
              {/* Mid-side tick marks */}
              <line
                x1="30"
                y1="10"
                x2="30"
                y2="14"
                stroke="rgba(0,255,255,0.45)"
                strokeWidth="0.8"
                strokeLinecap="square"
              />
              <line
                x1="30"
                y1="46"
                x2="30"
                y2="50"
                stroke="rgba(0,255,255,0.45)"
                strokeWidth="0.8"
                strokeLinecap="square"
              />
              <line
                x1="10"
                y1="30"
                x2="14"
                y2="30"
                stroke="rgba(0,255,255,0.45)"
                strokeWidth="0.8"
                strokeLinecap="square"
              />
              <line
                x1="46"
                y1="30"
                x2="50"
                y2="30"
                stroke="rgba(0,255,255,0.45)"
                strokeWidth="0.8"
                strokeLinecap="square"
              />
            </svg>
          </div>
        </div>

        {/* ── DETAIL PANELS (outside circular clip, at high z-index) ── */}
        {/* Satellite panel */}
        {selectedSatData && (
          <div
            style={{
              position: "absolute",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2000,
              pointerEvents: "all",
            }}
            data-ocid="satellite.panel"
          >
            <DetailPanel
              title={`◈ ${selectedSatData.name}`}
              accent="#ff8800"
              rows={[
                ["LAT", `${selectedSatData.lat.toFixed(2)}°`],
                ["LNG", `${selectedSatData.lng.toFixed(2)}°`],
                ["ALT", `${selectedSatData.alt.toLocaleString()} KM`],
                ["ORBIT", getOrbitType(selectedSatData.alt)],
                ["PERIOD", `~${getPeriod(selectedSatData.alt)} MIN`],
              ]}
              onClose={() => setSelectedSat(null)}
            />
          </div>
        )}

        {/* Flight panel */}
        {selectedFlight && (
          <div
            style={{
              position: "absolute",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2000,
              pointerEvents: "all",
            }}
            data-ocid="flight.panel"
          >
            <DetailPanel
              title={`✈ ${selectedFlight.callsign}`}
              accent="#00ffff"
              rows={[
                ["ICAO24", selectedFlight.icao24 || "—"],
                ["CALLSIGN", selectedFlight.callsign],
                ["COUNTRY", selectedFlight.originCountry || "—"],
                ["LAT", `${selectedFlight.lat.toFixed(4)}°`],
                ["LON", `${selectedFlight.lon.toFixed(4)}°`],
                ["BARO ALT", `${selectedFlight.alt.toLocaleString()} M`],
                ["GEO ALT", `${selectedFlight.geoAlt.toLocaleString()} M`],
                ["SPEED", `${selectedFlight.vel} KT`],
                ["HEADING", `${selectedFlight.hdg}°`],
                [
                  "VERT RATE",
                  selectedFlight.vertRate > 0
                    ? `+${selectedFlight.vertRate} FT/MIN`
                    : selectedFlight.vertRate < 0
                      ? `${selectedFlight.vertRate} FT/MIN`
                      : "LEVEL",
                ],
                ["SQUAWK", selectedFlight.squawk || "—"],
              ]}
              onClose={() => setSelectedFlight(null)}
            />
          </div>
        )}

        {/* Earthquake panel */}
        {selectedEq && (
          <div
            style={{
              position: "absolute",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2000,
              pointerEvents: "all",
            }}
            data-ocid="earthquake.panel"
          >
            <DetailPanel
              title="⚡ SEISMIC EVENT"
              accent={selectedEq.mag >= 5 ? "#ff3300" : "#ff6600"}
              rows={[
                ["MAGNITUDE", `M${selectedEq.mag.toFixed(1)}`],
                ["LOCATION", selectedEq.place.slice(0, 32)],
                ["LAT", `${selectedEq.lat.toFixed(2)}°`],
                ["LNG", `${selectedEq.lng.toFixed(2)}°`],
                [
                  "SEVERITY",
                  selectedEq.mag >= 5
                    ? "MAJOR"
                    : selectedEq.mag >= 3
                      ? "MODERATE"
                      : "MINOR",
                ],
              ]}
              onClose={() => setSelectedEq(null)}
            />
          </div>
        )}
      </div>
      {/* ── end center section ── */}

      {/* ── HUD Overlays (main wrapper, tracks sidebar widths) ── */}
      {hudVisible && (
        <>
          {/* PANOPTIC stats bar */}
          <div
            style={{
              position: "absolute",
              top: 4,
              left: leftCollapsed ? 0 : 270,
              right: rightCollapsed ? 0 : 260,
              zIndex: 1000,
              color: "#ff6600",
              fontSize: 9,
              fontFamily: "monospace",
              letterSpacing: "0.08em",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              textAlign: "center",
              transition: "left 0.3s ease, right 0.3s ease",
            }}
          >
            PANOPTIC VIS:{flightCount + eqCount} SRC:{layers.flights ? 1 : 0}
            {layers.earthquakes ? 1 : 0}
            {layers.satellites ? 1 : 0}
            {layers.weather ? 1 : 0} GLOBE-DIST:
            {globeZoomDist.toFixed(2)}
          </div>

          {/* Top-left HUD */}
          <div
            style={{
              position: "absolute",
              top: 40,
              left: (leftCollapsed ? 0 : 270) + 8,
              zIndex: 800,
              pointerEvents: "none",
              fontFamily: "monospace",
              transition: "left 0.3s ease",
            }}
          >
            <div
              style={{
                color: "#ff6600",
                fontSize: 9,
                letterSpacing: "0.1em",
              }}
            >
              TOP SECRET / SI-TK / NOFORN
            </div>
            <div style={{ color: "rgba(255,102,0,0.7)", fontSize: 8 }}>
              KH11-4166 OPS-4117
            </div>
            <div
              style={{
                color: "#00ffff",
                fontSize: 10,
                marginTop: 2,
                letterSpacing: "0.15em",
              }}
            >
              {mapStyle.label} MODE ACTIVE
            </div>
            <div
              style={{
                color: "rgba(0,255,255,0.7)",
                fontSize: 8,
                marginTop: 1,
              }}
            >
              GLOBE 3D · {activeCity.toUpperCase()} · DIST:
              {globeZoomDist.toFixed(2)} AU
            </div>
          </div>

          {/* Top-right HUD */}
          <div
            style={{
              position: "absolute",
              top: 40,
              right: (rightCollapsed ? 0 : 260) + 8,
              zIndex: 800,
              pointerEvents: "none",
              fontFamily: "monospace",
              textAlign: "right",
              transition: "right 0.3s ease",
            }}
          >
            <div style={{ color: "#00ffff", fontSize: 9 }}>
              <span style={{ color: "#ff3333" }}>●</span> REC {utcTime}
            </div>
            <div style={{ color: "rgba(0,255,255,0.5)", fontSize: 8 }}>
              ORB: 47439 PASS: DESC-179
            </div>
            <div style={{ marginTop: 6 }}>
              <div style={{ color: "rgba(0,255,255,0.4)", fontSize: 7 }}>
                ACTIVE STYLE
              </div>
              <div
                style={{
                  color: mapStyle.color,
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                }}
              >
                {mapStyle.label}
              </div>
            </div>
          </div>

          {/* Bottom-left HUD */}
          <div
            style={{
              position: "absolute",
              bottom: 4,
              left: (leftCollapsed ? 0 : 270) + 8,
              zIndex: 800,
              pointerEvents: "none",
              fontFamily: "monospace",
              transition: "left 0.3s ease",
            }}
          >
            <div style={{ color: "#ff6600", fontSize: 9 }}>
              {toDMS(mapCenter.lat, true)} {toDMS(mapCenter.lng, false)}
            </div>
            <div style={{ color: "rgba(255,102,0,0.6)", fontSize: 8 }}>
              MGRS: {getMGRS(mapCenter.lat, mapCenter.lng)}
            </div>
          </div>

          {/* Bottom-right HUD */}
          <div
            style={{
              position: "absolute",
              bottom: 90,
              right: (rightCollapsed ? 0 : 260) + 8,
              zIndex: 800,
              pointerEvents: "none",
              fontFamily: "monospace",
              textAlign: "right",
              transition: "right 0.3s ease",
            }}
          >
            <div style={{ color: "#00ffff", fontSize: 9 }}>
              GLOBE 3D · GSD:{getGSD(globeZoomDist)} NIIRS:
              {getNIIRS(globeZoomDist)}
            </div>
            <div style={{ color: "rgba(0,255,255,0.6)", fontSize: 8 }}>
              DIST:{globeZoomDist.toFixed(3)} · SUN: -50.7° EL
            </div>
            {layers.weather &&
              weatherData.length > 0 &&
              (() => {
                const nearest = weatherData.reduce((best, w) => {
                  const d =
                    Math.abs(w.lat - mapCenter.lat) +
                    Math.abs(w.lon - mapCenter.lng);
                  const bd =
                    Math.abs(best.lat - mapCenter.lat) +
                    Math.abs(best.lon - mapCenter.lng);
                  return d < bd ? w : best;
                });
                return (
                  <div style={{ color: "#aaddff", fontSize: 8, marginTop: 2 }}>
                    {nearest.city}: {nearest.temp.toFixed(0)}°C{" "}
                    {weatherCodeToLabel(nearest.weathercode)}{" "}
                    {nearest.windspeed.toFixed(0)}km/h
                  </div>
                );
              })()}
          </div>
        </>
      )}
      {/* ── Right Sidebar ── */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: rightCollapsed ? 0 : 260,
          background: "rgba(0,0,0,0.88)",
          borderLeft: rightCollapsed
            ? "none"
            : "1px solid rgba(0,255,255,0.12)",
          zIndex: 900,
          overflowY: rightCollapsed ? "hidden" : "auto",
          overflow: rightCollapsed ? "hidden" : undefined,
          transition: "width 0.3s ease",
          flexShrink: 0,
          pointerEvents: rightCollapsed ? "none" : "auto",
        }}
      >
        <div
          style={{
            padding: "10px 12px 6px",
            borderBottom: "1px solid rgba(0,255,255,0.1)",
          }}
        >
          <div
            style={{
              color: "rgba(0,255,255,0.5)",
              fontSize: 8,
              letterSpacing: "0.15em",
            }}
          >
            DISPLAY CONTROLS
          </div>
        </div>

        <div style={{ padding: "8px 12px" }}>
          {/* BLOOM */}
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <button
                type="button"
                data-ocid="controls.bloom.toggle"
                onClick={() => setBloom((b) => ({ ...b, active: !b.active }))}
                style={btnStyle(bloom.active)}
              >
                BLOOM
              </button>
              <span
                style={{
                  color: "rgba(0,255,255,0.5)",
                  fontSize: 8,
                  marginLeft: "auto",
                }}
              >
                {bloom.value}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={bloom.value}
              onChange={(e) =>
                setBloom((b) => ({ ...b, value: +e.target.value }))
              }
              className="cerebro-slider"
              style={{ width: "100%" }}
            />
          </div>

          {/* SHARPEN */}
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <button
                type="button"
                data-ocid="controls.sharpen.toggle"
                onClick={() => setSharpen((s) => ({ ...s, active: !s.active }))}
                style={btnStyle(sharpen.active)}
              >
                SHARPEN
              </button>
              <span
                style={{
                  color: "rgba(0,255,255,0.5)",
                  fontSize: 8,
                  marginLeft: "auto",
                }}
              >
                {sharpen.value}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={sharpen.value}
              onChange={(e) =>
                setSharpen((s) => ({ ...s, value: +e.target.value }))
              }
              className="cerebro-slider"
              style={{ width: "100%" }}
            />
          </div>

          {/* HUD TOGGLE */}
          <div style={{ marginBottom: 8 }}>
            <button
              type="button"
              data-ocid="controls.hud.toggle"
              onClick={() => {
                setHudVisible((v) => !v);
                setStorage("cerebro_hud", !hudVisible);
              }}
              style={btnStyle(hudVisible)}
            >
              HUD {hudVisible ? "ON" : "OFF"}
            </button>
          </div>

          {/* LABELS TOGGLE */}
          <div style={{ marginBottom: 8 }}>
            <button
              type="button"
              data-ocid="controls.labels.toggle"
              onClick={() => setShowFlightLabels((v) => !v)}
              style={btnStyle(showFlightLabels)}
            >
              FLIGHT LABELS {showFlightLabels ? "ON" : "OFF"}
            </button>
            <button
              type="button"
              data-ocid="controls.city_labels.toggle"
              onClick={() => setShowCityLabels((v) => !v)}
              style={btnStyle(showCityLabels)}
            >
              CITY LABELS {showCityLabels ? "ON" : "OFF"}
            </button>
          </div>

          {/* VISUAL MODE */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                color: "rgba(0,255,255,0.5)",
                fontSize: 7,
                marginBottom: 4,
                letterSpacing: "0.1em",
              }}
            >
              VISUAL MODE
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 3,
              }}
            >
              {(Object.keys(STYLE_CONFIGS) as StyleMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-ocid={`style.${m.toLowerCase()}.toggle`}
                  onClick={() => setActiveStyle(m)}
                  style={{
                    padding: "3px 6px",
                    fontSize: 8,
                    cursor: "pointer",
                    fontFamily: "monospace",
                    letterSpacing: "0.08em",
                    background:
                      activeStyle === m
                        ? "rgba(0,255,255,0.2)"
                        : "rgba(0,0,0,0.4)",
                    border: `1px solid ${
                      activeStyle === m ? "#00ffff" : "rgba(0,255,255,0.15)"
                    }`,
                    color:
                      activeStyle === m
                        ? STYLE_CONFIGS[m].color
                        : "rgba(0,255,255,0.4)",
                  }}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* CITY NAV */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                color: "rgba(0,255,255,0.5)",
                fontSize: 7,
                marginBottom: 4,
                letterSpacing: "0.1em",
              }}
            >
              CITY NAV
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {Object.entries(CITIES).map(([name, coords]) => (
                <button
                  key={name}
                  type="button"
                  data-ocid={`city.${name
                    .replace(/\s+/g, "-")
                    .toLowerCase()}.button`}
                  onClick={() => {
                    setActiveCity(name);
                    setStorage("cerebro_city", name);
                    // Fly camera to this city
                    setTargetCenter({ lat: coords.lat, lng: coords.lng });
                    addFeed("SYSTEM", `Navigating to ${name}`);
                  }}
                  style={{
                    padding: "2px 8px",
                    fontSize: 8,
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    letterSpacing: "0.06em",
                    background:
                      activeCity === name
                        ? "rgba(0,255,255,0.12)"
                        : "transparent",
                    border: `1px solid ${
                      activeCity === name
                        ? "rgba(0,255,255,0.4)"
                        : "rgba(0,255,255,0.1)"
                    }`,
                    color:
                      activeCity === name ? "#00ffff" : "rgba(0,255,255,0.5)",
                  }}
                >
                  {name.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
