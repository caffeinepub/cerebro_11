import { OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

export interface WeatherPoint {
  lat: number;
  lon: number;
  temp: number;
  windspeed: number;
  weathercode: number;
  city: string;
}

export interface FlightItem {
  lat: number;
  lon: number;
  callsign: string;
  icao24: string;
  originCountry: string;
  alt: number;
  geoAlt: number;
  vel: number;
  hdg: number;
  vertRate: number;
  squawk: string;
}

export interface EqItem {
  lat: number;
  lng: number;
  mag: number;
  place: string;
}

export interface SatItem {
  name: string;
  lat: number;
  lng: number;
  alt: number;
}

interface GlobeViewProps {
  flightData: FlightItem[];
  eqData: EqItem[];
  satData: SatItem[];
  weatherData: WeatherPoint[];
  layers: {
    flights: boolean;
    earthquakes: boolean;
    satellites: boolean;
    weather: boolean;
  };
  globeCenter: { lat: number; lng: number };
  targetCenter?: { lat: number; lng: number } | null;
  selectedSat: string | null;
  selectedFlight: FlightItem | null;
  onSatelliteClick: (name: string | null) => void;
  onFlightClick: (f: FlightItem) => void;
  onEarthquakeClick: (eq: EqItem) => void;
  onCenterChange: (lat: number, lng: number) => void;
  onZoomChange: (distance: number) => void;
  cityData: Array<{ name: string; lat: number; lng: number }>;
  onCityClick: (name: string, lat: number, lng: number) => void;
  showFlightLabels?: boolean;
  showCityLabels?: boolean;
}

// ─── Geo math helpers ─────────────────────────────────────────────────────────

function latLngToVec3(
  lat: number,
  lng: number,
  radius = 1,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -Math.sin(phi) * Math.cos(theta) * radius;
  const z = Math.sin(phi) * Math.sin(theta) * radius;
  const y = Math.cos(phi) * radius;
  return [x, y, z];
}

function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function tile2lon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function lat2tile(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      2 ** z,
  );
}

function lon2tile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function createTilePatchGeometry(
  northLat: number,
  southLat: number,
  westLon: number,
  eastLon: number,
): THREE.BufferGeometry {
  const segs = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const mercNorth = Math.log(
    Math.tan((northLat * Math.PI) / 180 / 2 + Math.PI / 4),
  );
  const mercSouth = Math.log(
    Math.tan((southLat * Math.PI) / 180 / 2 + Math.PI / 4),
  );

  for (let i = 0; i <= segs; i++) {
    for (let j = 0; j <= segs; j++) {
      const lat = northLat + (southLat - northLat) * (i / segs);
      const lon = westLon + (eastLon - westLon) * (j / segs);
      const [x, y, z] = latLngToVec3(lat, lon, 1.001);
      positions.push(x, y, z);
      const u = j / segs;
      const mercLat = Math.log(
        Math.tan((lat * Math.PI) / 180 / 2 + Math.PI / 4),
      );
      const v = (mercLat - mercSouth) / (mercNorth - mercSouth);
      uvs.push(u, v);
    }
  }

  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const b = a + segs + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// ─── Tile system ──────────────────────────────────────────────────────────────────
// TWO-LAYER MODEL (Google Maps style):
//   Layer 1: BASE (z=2, 16 tiles) — always present, never removed, renderOrder=10
//   Layer 2: DETAIL (z=3..8) — one zoom level at a time, renderOrder=20
// Detail tiles always paint over base. Only one detail zoom active at a time.
// Tiles load center-first (sorted by distance from camera center tile).

const BASE_ZOOM = 2;
const MIN_DETAIL_ZOOM = 3;
const MAX_DETAIL_ZOOM = 8;
const DETAIL_TILE_CACHE = 400;

function disposeTile(mesh: THREE.Mesh, group: THREE.Group) {
  mesh.geometry.dispose();
  (mesh.material as THREE.MeshBasicMaterial).map?.dispose();
  (mesh.material as THREE.MeshBasicMaterial).dispose();
  group.remove(mesh);
}

function TiledGlobe() {
  const groupRef = useRef<THREE.Group>(null!);
  const tilesRef = useRef<Map<string, THREE.Mesh | "loading">>(new Map());
  const baseTileKeysRef = useRef<Set<string>>(new Set());
  const activeDetailZoomRef = useRef<number>(-1);
  const zoomGenRef = useRef<Map<number, number>>(new Map());
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCleanupZoomRef = useRef<number>(-1);
  const frameCountRef = useRef(0);
  const baseTilesLoadedRef = useRef(false);
  const textureLoader = useRef(new THREE.TextureLoader());
  const { camera } = useThree();

  const getTileUrl = useCallback((z: number, x: number, y: number): string => {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  }, []);

  const getGen = useCallback((z: number): number => {
    return zoomGenRef.current.get(z) ?? 0;
  }, []);

  const bumpGen = useCallback((z: number): number => {
    const next = (zoomGenRef.current.get(z) ?? 0) + 1;
    zoomGenRef.current.set(z, next);
    return next;
  }, []);

  const removeDetailZoom = useCallback((z: number) => {
    if (!groupRef.current) return;
    const prefix = `${z}/`;
    for (const [key, mesh] of Array.from(tilesRef.current.entries())) {
      if (key.startsWith(prefix) && !baseTileKeysRef.current.has(key)) {
        if (mesh instanceof THREE.Mesh) {
          disposeTile(mesh, groupRef.current);
        }
        tilesRef.current.delete(key);
      }
    }
  }, []);

  const loadTile = useCallback(
    (tileZ: number, tx: number, ty: number, isBase = false) => {
      const key = `${tileZ}/${tx}/${ty}`;
      if (tilesRef.current.has(key)) return;
      tilesRef.current.set(key, "loading");

      const northLat = tile2lat(ty, tileZ);
      const southLat = tile2lat(ty + 1, tileZ);
      const westLon = tile2lon(tx, tileZ);
      const eastLon = tile2lon(tx + 1, tileZ);
      const url = getTileUrl(tileZ, tx, ty);
      const capturedGen = getGen(tileZ);

      textureLoader.current.load(
        url,
        (texture) => {
          if (!isBase && getGen(tileZ) !== capturedGen) {
            texture.dispose();
            tilesRef.current.delete(key);
            return;
          }
          if (!isBase && tileZ !== activeDetailZoomRef.current) {
            texture.dispose();
            tilesRef.current.delete(key);
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          const geom = createTilePatchGeometry(
            northLat,
            southLat,
            westLon,
            eastLon,
          );
          const mat = new THREE.MeshBasicMaterial({
            map: texture,
            depthTest: false,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: isBase ? -1 : -2,
            polygonOffsetUnits: isBase ? -1 : -2,
          });
          const mesh = new THREE.Mesh(geom, mat);
          mesh.renderOrder = isBase ? 10 : 20;
          tilesRef.current.set(key, mesh);
          if (groupRef.current) groupRef.current.add(mesh);
        },
        undefined,
        () => {
          tilesRef.current.delete(key);
        },
      );
    },
    [getTileUrl, getGen],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only
  useEffect(() => {
    if (baseTilesLoadedRef.current) return;
    baseTilesLoadedRef.current = true;
    const n = 2 ** BASE_ZOOM;
    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        const k = `${BASE_ZOOM}/${tx}/${ty}`;
        baseTileKeysRef.current.add(k);
        loadTile(BASE_ZOOM, tx, ty, true);
      }
    }
  }, [loadTile]);

  useEffect(() => {
    return () => {
      if (cleanupTimerRef.current !== null)
        clearTimeout(cleanupTimerRef.current);
    };
  }, []);

  useFrame(() => {
    frameCountRef.current++;
    if (frameCountRef.current % 8 !== 0) return;
    if (!groupRef.current) return;

    const dist = camera.position.length();

    let desiredDetail: number;
    if (dist >= 2.5) desiredDetail = -1;
    else if (dist >= 1.8) desiredDetail = 3;
    else if (dist >= 1.45) desiredDetail = 4;
    else if (dist >= 1.25) desiredDetail = 5;
    else if (dist >= 1.13) desiredDetail = 6;
    else if (dist >= 1.07) desiredDetail = 7;
    else desiredDetail = MAX_DETAIL_ZOOM;

    const prevDetail = activeDetailZoomRef.current;

    if (desiredDetail !== prevDetail) {
      if (cleanupTimerRef.current !== null) {
        clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }

      const isZoomingOut = desiredDetail < prevDetail || desiredDetail === -1;

      if (prevDetail > 0) {
        bumpGen(prevDetail);

        if (isZoomingOut) {
          // Zooming out: immediately remove ALL detail tiles with zoom > desiredDetail
          // (any higher-res tiles must not be visible at a lower zoom level)
          for (
            let z = desiredDetail > 0 ? desiredDetail + 1 : MIN_DETAIL_ZOOM;
            z <= MAX_DETAIL_ZOOM;
            z++
          ) {
            if (z !== desiredDetail) {
              bumpGen(z);
              removeDetailZoom(z);
            }
          }
          pendingCleanupZoomRef.current = -1;
        } else {
          pendingCleanupZoomRef.current = prevDetail;
          cleanupTimerRef.current = setTimeout(() => {
            cleanupTimerRef.current = null;
            if (pendingCleanupZoomRef.current > 0) {
              removeDetailZoom(pendingCleanupZoomRef.current);
              pendingCleanupZoomRef.current = -1;
            }
          }, 2500);
        }
      }

      activeDetailZoomRef.current = desiredDetail;
    }

    const activeZ = activeDetailZoomRef.current;
    if (activeZ > 0) {
      const camDir = camera.position.clone().normalize();
      const lat =
        90 - Math.acos(Math.max(-1, Math.min(1, camDir.y))) * (180 / Math.PI);
      let lng = Math.atan2(camDir.z, -camDir.x) * (180 / Math.PI) - 180;
      if (lng < -180) lng += 360;

      const maxTiles = 2 ** activeZ;
      const centerTileX = lon2tile(lng, activeZ);
      const centerTileY = lat2tile(lat, activeZ);

      const horizonAngleDeg =
        Math.asin(Math.min(1, 1 / dist)) * (180 / Math.PI);
      const fovHalfDeg = 25;
      const halfAngleDeg = Math.min(horizonAngleDeg, fovHalfDeg * 2.0);
      const tileDegSize = 360 / maxTiles;
      const tileRadius = Math.min(
        24,
        Math.ceil(halfAngleDeg / tileDegSize) + 2,
      );

      const candidates: Array<{ tx: number; ty: number; d: number }> = [];
      for (let dy = -tileRadius; dy <= tileRadius; dy++) {
        for (let dx = -tileRadius; dx <= tileRadius; dx++) {
          const tx = (((centerTileX + dx) % maxTiles) + maxTiles) % maxTiles;
          const ty = centerTileY + dy;
          if (ty < 0 || ty >= maxTiles) continue;
          const k = `${activeZ}/${tx}/${ty}`;
          if (!tilesRef.current.has(k)) {
            candidates.push({ tx, ty, d: Math.abs(dx) + Math.abs(dy) });
          }
        }
      }

      candidates.sort((a, b) => a.d - b.d);
      const loadLimit = 12;
      for (let i = 0; i < Math.min(candidates.length, loadLimit); i++) {
        loadTile(activeZ, candidates[i].tx, candidates[i].ty, false);
      }
    }

    let detailCount = 0;
    for (const key of tilesRef.current.keys()) {
      if (!baseTileKeysRef.current.has(key)) detailCount++;
    }
    if (detailCount > DETAIL_TILE_CACHE) {
      let evicted = 0;
      for (const [key, mesh] of Array.from(tilesRef.current.entries())) {
        if (baseTileKeysRef.current.has(key)) continue;
        const keyZ = Number.parseInt(key.split("/")[0], 10);
        if (keyZ === activeDetailZoomRef.current) continue;
        if (keyZ === pendingCleanupZoomRef.current) continue;
        if (mesh instanceof THREE.Mesh) disposeTile(mesh, groupRef.current);
        tilesRef.current.delete(key);
        evicted++;
        if (evicted >= 20) break;
      }
    }
  });

  return (
    <>
      <mesh renderOrder={0}>
        <sphereGeometry args={[0.998, 48, 48]} />
        <meshBasicMaterial color="#1a3050" />
      </mesh>
      <mesh renderOrder={1}>
        <sphereGeometry args={[1.0002, 32, 16, 0, Math.PI * 2, 0, 0.09]} />
        <meshBasicMaterial
          color="#003959"
          transparent
          opacity={0.82}
          depthWrite={false}
        />
      </mesh>
      <mesh renderOrder={1} rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[1.0002, 32, 16, 0, Math.PI * 2, 0, 0.09]} />
        <meshBasicMaterial color="#ddeeff" />
      </mesh>
      <group ref={groupRef} />
    </>
  );
}

// ─── Flight helpers ───────────────────────────────────────────────────────────

function getFlightQuaternion(
  lat: number,
  lng: number,
  hdg: number,
): THREE.Quaternion {
  const latR = lat * (Math.PI / 180);
  const thetaR = (lng + 180) * (Math.PI / 180);
  const hdgR = hdg * (Math.PI / 180);

  const north = new THREE.Vector3(
    Math.sin(latR) * Math.cos(thetaR),
    Math.cos(latR),
    -Math.sin(latR) * Math.sin(thetaR),
  ).normalize();

  const east = new THREE.Vector3(
    Math.sin(thetaR),
    0,
    Math.cos(thetaR),
  ).normalize();

  const headingDir = new THREE.Vector3()
    .addScaledVector(north, Math.cos(hdgR))
    .addScaledVector(east, Math.sin(hdgR))
    .normalize();

  const [nx, ny, nz] = latLngToVec3(lat, lng, 1);
  const surfaceNormal = new THREE.Vector3(nx, ny, nz).normalize();

  const mat = new THREE.Matrix4();
  const right = new THREE.Vector3()
    .crossVectors(headingDir, surfaceNormal)
    .normalize();
  mat.makeBasis(right, headingDir, surfaceNormal);
  return new THREE.Quaternion().setFromRotationMatrix(mat);
}

function createAirplaneGeometry(): THREE.ShapeGeometry {
  const s = 0.006;
  const shape = new THREE.Shape();
  shape.moveTo(0, s * 0.9);
  shape.lineTo(s * 0.09, s * 0.25);
  shape.lineTo(s * 0.55, -s * 0.15);
  shape.lineTo(s * 0.52, -s * 0.28);
  shape.lineTo(s * 0.09, -s * 0.12);
  shape.lineTo(s * 0.22, -s * 0.82);
  shape.lineTo(s * 0.2, -s * 0.88);
  shape.lineTo(0, -s * 0.72);
  shape.lineTo(-s * 0.2, -s * 0.88);
  shape.lineTo(-s * 0.22, -s * 0.82);
  shape.lineTo(-s * 0.09, -s * 0.12);
  shape.lineTo(-s * 0.52, -s * 0.28);
  shape.lineTo(-s * 0.55, -s * 0.15);
  shape.lineTo(-s * 0.09, s * 0.25);
  shape.lineTo(0, s * 0.9);
  return new THREE.ShapeGeometry(shape);
}

function FlightTail({
  lat,
  lon,
  hdg,
  altRadius,
}: { lat: number; lon: number; hdg: number; altRadius: number }) {
  const geom = useMemo(() => {
    const backHdg = hdg + 180;
    const backHdgR = backHdg * (Math.PI / 180);
    const latR = lat * (Math.PI / 180);
    const thetaR = (lon + 180) * (Math.PI / 180);
    const north = new THREE.Vector3(
      Math.sin(latR) * Math.cos(thetaR),
      Math.cos(latR),
      -Math.sin(latR) * Math.sin(thetaR),
    ).normalize();
    const east = new THREE.Vector3(
      Math.sin(thetaR),
      0,
      Math.cos(thetaR),
    ).normalize();
    const backDir = new THREE.Vector3()
      .addScaledVector(north, Math.cos(backHdgR))
      .addScaledVector(east, Math.sin(backHdgR))
      .normalize();
    const origin = new THREE.Vector3(...latLngToVec3(lat, lon, altRadius));
    const N = 12;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const angle = t * 0.045;
      const rotAxis = new THREE.Vector3()
        .crossVectors(origin.clone().normalize(), backDir)
        .normalize();
      const dir = origin
        .clone()
        .normalize()
        .applyAxisAngle(rotAxis, angle)
        .multiplyScalar(altRadius);
      points.push(dir);
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [lat, lon, hdg, altRadius]);

  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: "#00ffff",
        opacity: 0.55,
        transparent: true,
      }),
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(
    () => () => {
      geom.dispose();
      mat.dispose();
    },
    [],
  );

  return <primitive object={new THREE.Line(geom, mat)} />;
}

// ─── Three.js sprite labels (no HTML canvas overlay) ──────────────────────────
// Pure WebGL sprites rendered at renderOrder=9000 with depthTest=false.
// They never touch the tile render pipeline.

const labelTexCache = new Map<string, THREE.CanvasTexture>();

function makeLabelTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 26px monospace";
  const textW = Math.ceil(ctx.measureText(text).width);
  canvas.width = textW + 16;
  canvas.height = 32;
  ctx.font = "bold 26px monospace";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.fillText(text, 8, 24);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function getCachedLabelTex(text: string, color: string): THREE.CanvasTexture {
  const k = `${text}|${color}`;
  if (!labelTexCache.has(k)) {
    labelTexCache.set(k, makeLabelTexture(text, color));
  }
  return labelTexCache.get(k)!;
}

function FlightLabel({ flight }: { flight: FlightItem }) {
  const text = flight.callsign || flight.icao24;
  const altRadius = 1.001 + Math.max(0, flight.alt / 6371000) * 20;
  const [bx, by, bz] = latLngToVec3(flight.lat, flight.lon, altRadius + 0.001);
  const texture = useMemo(() => getCachedLabelTex(text, "#00ffff"), [text]);
  const aspect = texture.image
    ? (texture.image as HTMLCanvasElement).width /
      (texture.image as HTMLCanvasElement).height
    : 4;
  const sh = 0.006;
  const sw = sh * aspect;
  const norm = new THREE.Vector3(bx, by, bz).normalize();
  const east = new THREE.Vector3(0, 1, 0).cross(norm).normalize();
  const down = norm.clone().cross(east).normalize().negate();
  const baseOffset = east
    .clone()
    .multiplyScalar(sw * 0.6)
    .add(down.clone().multiplyScalar(sh * 0.5));
  const spriteRef = useRef<THREE.Sprite>(null!);
  const { camera } = useThree();
  useFrame(() => {
    if (!spriteRef.current) return;
    const cdist = camera.position.length();
    const scale = cdist / 2.5;
    spriteRef.current.position.set(
      bx + baseOffset.x * scale,
      by + baseOffset.y * scale,
      bz + baseOffset.z * scale,
    );
  });
  return (
    <sprite
      ref={spriteRef}
      position={[bx + baseOffset.x, by + baseOffset.y, bz + baseOffset.z]}
      scale={[sw, sh, 1]}
      renderOrder={9000}
    >
      <spriteMaterial
        map={texture}
        transparent
        alphaTest={0.01}
        depthWrite={false}
        depthTest={false}
        sizeAttenuation={false}
      />
    </sprite>
  );
}

function CityLabel({
  city,
}: { city: { name: string; lat: number; lng: number } }) {
  const text = city.name.toUpperCase();
  const [bx, by, bz] = latLngToVec3(city.lat, city.lng, 1.001);
  const texture = useMemo(() => getCachedLabelTex(text, "#00ffcc"), [text]);
  const aspect = texture.image
    ? (texture.image as HTMLCanvasElement).width /
      (texture.image as HTMLCanvasElement).height
    : 5;
  const sh = 0.007;
  const sw = sh * aspect;
  const norm = new THREE.Vector3(bx, by, bz).normalize();
  const east = new THREE.Vector3(0, 1, 0).cross(norm).normalize();
  const down = norm.clone().cross(east).normalize().negate();
  const baseOffset = east
    .clone()
    .multiplyScalar(sw * 0.6)
    .add(down.clone().multiplyScalar(sh * 0.5));
  const spriteRef = useRef<THREE.Sprite>(null!);
  const { camera } = useThree();
  useFrame(() => {
    if (!spriteRef.current) return;
    const cdist = camera.position.length();
    const scale = cdist / 2.5;
    spriteRef.current.position.set(
      bx + baseOffset.x * scale,
      by + baseOffset.y * scale,
      bz + baseOffset.z * scale,
    );
  });
  return (
    <sprite
      ref={spriteRef}
      position={[bx + baseOffset.x, by + baseOffset.y, bz + baseOffset.z]}
      scale={[sw, sh, 1]}
      renderOrder={9000}
    >
      <spriteMaterial
        map={texture}
        transparent
        alphaTest={0.01}
        depthWrite={false}
        depthTest={false}
        sizeAttenuation={false}
      />
    </sprite>
  );
}

// ─── Satellite 3D mesh ────────────────────────────────────────────────────────

function Satellite3DMesh({
  satPos,
  isSelected,
}: { satPos: THREE.Vector3; isSelected: boolean }) {
  const bodyColor = isSelected ? "#ffff00" : "#ccddff";
  const panelColor = "#3366cc";
  const glowColor = "#ffff44";

  const radial = satPos.clone().normalize();
  const ref2 =
    Math.abs(radial.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const panelAxis = new THREE.Vector3().crossVectors(radial, ref2).normalize();
  const forwardAxis = new THREE.Vector3()
    .crossVectors(panelAxis, radial)
    .normalize();

  // biome-ignore lint/correctness/useExhaustiveDependencies: sub-property deps intentional
  const quat = useMemo(() => {
    const m = new THREE.Matrix4();
    m.makeBasis(panelAxis, radial, forwardAxis);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }, [
    panelAxis.x,
    panelAxis.y,
    panelAxis.z,
    radial.x,
    radial.y,
    radial.z,
    forwardAxis.x,
    forwardAxis.y,
    forwardAxis.z,
  ]);

  const s = 0.006;
  return (
    <group quaternion={quat}>
      <mesh>
        <boxGeometry args={[s, s * 1.4, s]} />
        <meshBasicMaterial color={bodyColor} />
      </mesh>
      <mesh position={[-s * 2.8, 0, 0]}>
        <boxGeometry args={[s * 3.2, s * 0.15, s * 1.4]} />
        <meshBasicMaterial color={panelColor} transparent opacity={0.85} />
      </mesh>
      <mesh position={[s * 2.8, 0, 0]}>
        <boxGeometry args={[s * 3.2, s * 0.15, s * 1.4]} />
        <meshBasicMaterial color={panelColor} transparent opacity={0.85} />
      </mesh>
      {isSelected && (
        <mesh>
          <sphereGeometry args={[s * 2, 8, 8]} />
          <meshBasicMaterial
            color={glowColor}
            transparent
            opacity={0.25}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

// ─── City marker ──────────────────────────────────────────────────────────────

function CityMarker({
  lat,
  lng,
  onClick,
}: {
  name: string;
  lat: number;
  lng: number;
  onClick: () => void;
  visible: boolean;
}) {
  const [x, y, z] = latLngToVec3(lat, lng, 1.001);

  const pinTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 32, 32);
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(16, 16, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#00ffcc";
    ctx.beginPath();
    ctx.arc(16, 16, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(16, 4);
    ctx.lineTo(16, 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, 20);
    ctx.lineTo(16, 28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(4, 16);
    ctx.lineTo(12, 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(20, 16);
    ctx.lineTo(28, 16);
    ctx.stroke();
    return new THREE.CanvasTexture(canvas);
  }, []);

  useEffect(() => () => pinTexture.dispose(), [pinTexture]);

  return (
    <group>
      <sprite position={[x, y, z]} scale={[0.013, 0.013, 1]} renderOrder={9000}>
        <spriteMaterial
          map={pinTexture}
          transparent
          depthWrite={false}
          depthTest={false}
          sizeAttenuation={false}
        />
      </sprite>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Three.js mesh */}
      <mesh
        position={[x, y, z]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function WeatherMarker({ point }: { point: WeatherPoint }) {
  const [x, y, z] = latLngToVec3(point.lat, point.lon, 1.003);
  const temp = point.temp;
  const color =
    temp < 0
      ? "#4488ff"
      : temp < 15
        ? "#00ffcc"
        : temp < 25
          ? "#ffff00"
          : "#ff4400";
  return (
    <mesh position={[x, y, z]}>
      <sphereGeometry args={[0.002, 5, 5]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} />
    </mesh>
  );
}

// ─── Earth component ───────────────────────────────────────────────────────────

interface EarthProps extends Omit<GlobeViewProps, "globeCenter"> {
  initCenter: { lat: number; lng: number };
  cameraDistRef: React.MutableRefObject<number>;
}

function Earth({
  flightData,
  eqData,
  satData,
  weatherData,
  layers,
  selectedSat,
  selectedFlight,
  onSatelliteClick,
  onFlightClick,
  onEarthquakeClick,
  onCenterChange,
  onZoomChange,
  cityData,
  onCityClick,
  initCenter,
  targetCenter,
  cameraDistRef,
  showFlightLabels: showFlightLabelsProp = true,
  showCityLabels: showCityLabelsProp = true,
}: EarthProps) {
  const { camera } = useThree();
  const airplaneGeom = useMemo(() => createAirplaneGeometry(), []);
  const animTargetRef = useRef<THREE.Vector3 | null>(null);
  const prevTargetRef = useRef<{ lat: number; lng: number } | null>(null);
  // Tracks the camera-facing direction for back-face culling of markers
  const cameraDirRef = useRef(new THREE.Vector3(0, 1, 0));

  // Helper: returns true if lat/lng is on the camera-facing hemisphere
  const isVisible = useCallback((lat: number, lng: number): boolean => {
    const [vx, vy, vz] = latLngToVec3(lat, lng, 1);
    const vec = new THREE.Vector3(vx, vy, vz).normalize();
    return vec.dot(cameraDirRef.current) > -0.1;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only
  useEffect(() => {
    const [x, y, z] = latLngToVec3(initCenter.lat, initCenter.lng, 4.5);
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  }, []);

  useEffect(() => {
    if (!targetCenter) return;
    if (
      prevTargetRef.current?.lat === targetCenter.lat &&
      prevTargetRef.current?.lng === targetCenter.lng
    )
      return;
    prevTargetRef.current = { ...targetCenter };
    const [tx, ty, tz] = latLngToVec3(targetCenter.lat, targetCenter.lng, 1.35);
    animTargetRef.current = new THREE.Vector3(tx, ty, tz);
  }, [targetCenter]);

  useFrame(() => {
    if (animTargetRef.current) {
      camera.position.lerp(animTargetRef.current, 0.06);
      if (camera.position.distanceTo(animTargetRef.current) < 0.003) {
        camera.position.copy(animTargetRef.current);
        animTargetRef.current = null;
      }
    }
    camera.lookAt(0, 0, 0);
    const dist = camera.position.length();
    cameraDistRef.current = dist;
    onZoomChange(dist);
    const dir = camera.position.clone().normalize();
    // Keep camera direction for visibility culling
    cameraDirRef.current.copy(dir);
    const lat =
      90 - Math.acos(Math.max(-1, Math.min(1, dir.y))) * (180 / Math.PI);
    // Bug fix: normalize lng to [-180, 180]
    let lng = Math.atan2(dir.z, -dir.x) * (180 / Math.PI) - 180;
    if (lng < -180) lng += 360;
    onCenterChange(lat, lng);
  });

  const cameraDist = cameraDistRef.current;

  return (
    <>
      <TiledGlobe />

      {/* Atmosphere */}
      <mesh renderOrder={20}>
        <sphereGeometry args={[1.01, 32, 32]} />
        <meshBasicMaterial
          color="#1a4a6e"
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.FrontSide}
        />
      </mesh>
      <mesh renderOrder={20}>
        <sphereGeometry args={[1.05, 32, 32]} />
        <meshBasicMaterial
          color="#0a2a4e"
          transparent
          opacity={0.06}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      {/* ── FLIGHTS ── */}
      {layers.flights &&
        flightData
          .filter((f) => isVisible(f.lat, f.lon))
          .map((f) => {
            const isFlightSelected =
              selectedFlight?.icao24 === f.icao24 &&
              selectedFlight?.callsign === f.callsign;
            const altRadius = 1.001 + Math.max(0, f.alt / 6371000) * 20;
            const [x, y, z] = latLngToVec3(f.lat, f.lon, altRadius);
            const quat = getFlightQuaternion(f.lat, f.lon, f.hdg);
            const iconScale = cameraDist / 2.5;
            return (
              <group key={`f-${f.callsign}-${f.lat.toFixed(2)}`}>
                <FlightTail
                  lat={f.lat}
                  lon={f.lon}
                  hdg={f.hdg}
                  altRadius={altRadius}
                />
                <mesh
                  position={[x, y, z]}
                  quaternion={quat}
                  scale={
                    isFlightSelected
                      ? [1.8 * iconScale, 1.8 * iconScale, 1.8 * iconScale]
                      : [iconScale, iconScale, iconScale]
                  }
                  renderOrder={100}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!isVisible(f.lat, f.lon)) return;
                    onFlightClick(f);
                  }}
                >
                  <primitive object={airplaneGeom} attach="geometry" />
                  <meshBasicMaterial
                    color={isFlightSelected ? "#ffff44" : "#00ffff"}
                    side={THREE.DoubleSide}
                    depthTest={false}
                    depthWrite={false}
                  />
                </mesh>
                <mesh
                  position={[x, y, z]}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!isVisible(f.lat, f.lon)) return;
                    onFlightClick(f);
                  }}
                >
                  <sphereGeometry
                    args={[Math.min(0.009, 0.006 * cameraDist), 6, 6]}
                  />
                  <meshBasicMaterial
                    transparent
                    opacity={0}
                    depthWrite={false}
                  />
                </mesh>
                {isFlightSelected && (
                  <mesh position={[x, y, z]} renderOrder={101}>
                    <sphereGeometry args={[0.008 * iconScale, 8, 8]} />
                    <meshBasicMaterial
                      color="#ffff44"
                      transparent
                      opacity={0.3}
                      blending={THREE.AdditiveBlending}
                      depthWrite={false}
                    />
                  </mesh>
                )}
                {showFlightLabelsProp && <FlightLabel flight={f} />}
              </group>
            );
          })}

      {/* ── EARTHQUAKES ── */}
      {layers.earthquakes &&
        eqData
          .filter((eq) => isVisible(eq.lat, eq.lng))
          .map((eq) => {
            const [x, y, z] = latLngToVec3(eq.lat, eq.lng, 1.003);
            const color =
              eq.mag >= 5 ? "#ff3300" : eq.mag >= 3 ? "#ff6600" : "#ffcc00";
            const size = Math.max(0.004, eq.mag * 0.004);
            return (
              <group key={`eq-${eq.lat}-${eq.lng}`}>
                <mesh position={[x, y, z]} renderOrder={50}>
                  <sphereGeometry args={[size, 8, 8]} />
                  <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.45}
                    depthTest={false}
                    depthWrite={false}
                  />
                </mesh>
                {(() => {
                  const eqNorm = new THREE.Vector3(x, y, z).normalize();
                  const eqQuat = new THREE.Quaternion().setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0),
                    eqNorm,
                  );
                  return (
                    <mesh
                      position={[x, y, z]}
                      quaternion={eqQuat}
                      renderOrder={50}
                    >
                      <torusGeometry args={[size * 2.2, size * 0.3, 8, 24]} />
                      <meshBasicMaterial
                        color={color}
                        transparent
                        opacity={0.2}
                        depthTest={false}
                        depthWrite={false}
                      />
                    </mesh>
                  );
                })()}
                <mesh
                  position={[x, y, z]}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!isVisible(eq.lat, eq.lng)) return;
                    onEarthquakeClick(eq);
                  }}
                >
                  <sphereGeometry
                    args={[Math.min(0.018, 0.012 * cameraDist), 6, 6]}
                  />
                  <meshBasicMaterial
                    transparent
                    opacity={0}
                    depthWrite={false}
                  />
                </mesh>
              </group>
            );
          })}

      {/* ── SATELLITES ── */}
      {layers.satellites &&
        cameraDist >= 1.6 &&
        satData
          .filter((sat) => isVisible(sat.lat, sat.lng))
          .map((sat) => {
            const altOffset =
              1 + (Math.min(Math.max(sat.alt, 100), 40000) / 40000) ** 0.5;
            const [x, y, z] = latLngToVec3(sat.lat, sat.lng, altOffset);
            const isSelected = selectedSat === sat.name;
            return (
              <group key={`sat-${sat.name}`}>
                <group position={[x, y, z]}>
                  <Satellite3DMesh
                    satPos={new THREE.Vector3(x, y, z)}
                    isSelected={isSelected}
                  />
                  <mesh
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (!isVisible(sat.lat, sat.lng)) return;
                      onSatelliteClick(isSelected ? null : sat.name);
                    }}
                  >
                    <sphereGeometry args={[0.028, 6, 6]} />
                    <meshBasicMaterial
                      transparent
                      opacity={0}
                      depthWrite={false}
                    />
                  </mesh>
                </group>
                {isSelected &&
                  (() => {
                    const satVec = new THREE.Vector3(
                      ...latLngToVec3(sat.lat, sat.lng, 1),
                    ).normalize();
                    const arbitrary =
                      Math.abs(satVec.y) < 0.9
                        ? new THREE.Vector3(0, 1, 0)
                        : new THREE.Vector3(1, 0, 0);
                    const ringNormal = new THREE.Vector3()
                      .crossVectors(satVec, arbitrary)
                      .normalize();
                    const orbitQuat = new THREE.Quaternion().setFromUnitVectors(
                      new THREE.Vector3(0, 0, 1),
                      ringNormal,
                    );
                    return (
                      <mesh quaternion={orbitQuat} renderOrder={60}>
                        <torusGeometry args={[altOffset, 0.004, 12, 128]} />
                        <meshBasicMaterial
                          color="#ffee00"
                          transparent
                          opacity={0.7}
                          depthWrite={false}
                          blending={THREE.AdditiveBlending}
                        />
                      </mesh>
                    );
                  })()}
              </group>
            );
          })}

      {/* ── WEATHER ── */}
      {layers.weather &&
        weatherData.map((w) => <WeatherMarker key={`w-${w.city}`} point={w} />)}

      {/* ── CITIES ── */}
      {cityData
        .filter((city) => isVisible(city.lat, city.lng))
        .map((city) => (
          <group key={`city-${city.name}`}>
            <CityMarker
              name={city.name}
              lat={city.lat}
              lng={city.lng}
              onClick={() => onCityClick(city.name, city.lat, city.lng)}
              visible={showCityLabelsProp}
            />
            {showCityLabelsProp && <CityLabel city={city} />}
          </group>
        ))}
    </>
  );
}

// ─── Globe Scene ───────────────────────────────────────────────────────────────

function GlobeScene(
  props: Omit<GlobeViewProps, "globeCenter"> & {
    initCenter: { lat: number; lng: number };
    cameraDistRef: React.MutableRefObject<number>;
  },
) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 3, 5]} intensity={1.0} />
      <Stars
        radius={300}
        depth={50}
        count={4000}
        factor={4}
        saturation={0}
        fade
        speed={0.3}
      />
      <Suspense fallback={null}>
        <Earth {...props} />
      </Suspense>
      <OrbitControls
        enablePan={false}
        minDistance={1.02}
        maxDistance={4.5}
        rotateSpeed={0.45}
        zoomSpeed={0.9}
        autoRotate={false}
      />
    </>
  );
}

// ─── Public export ─────────────────────────────────────────────────────────────

export default function GlobeView(props: GlobeViewProps) {
  const { globeCenter, ...rest } = props;
  const [loaded, setLoaded] = useState(false);
  const cameraDistRef = useRef(2.5);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      ref={containerRef as unknown as React.RefObject<HTMLDivElement>}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(0,255,255,0.5)",
            fontSize: 10,
            fontFamily: "monospace",
            letterSpacing: "0.15em",
            background: "#050510",
            zIndex: 10,
          }}
        >
          INITIALIZING GLOBE...
        </div>
      )}
      <Canvas
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          alpha: false,
        }}
        camera={{ fov: 45, near: 0.01, far: 1000 }}
        style={{ background: "#000008", touchAction: "none" }}
        eventSource={containerRef as React.RefObject<HTMLElement>}
        eventPrefix="offset"
        resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
      >
        <GlobeScene
          {...rest}
          initCenter={globeCenter}
          cameraDistRef={cameraDistRef}
        />
      </Canvas>
    </div>
  );
}
