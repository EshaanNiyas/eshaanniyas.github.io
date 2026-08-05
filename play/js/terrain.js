// Terrain: rolling hills that are flattened under the road network and under
// every landmark pad, so the visual mesh and the physics heightfield agree.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export const WORLD_SIZE = 460;          // square, centred on the origin
export const HALF = WORLD_SIZE / 2;
const CELL = 2.5;                        // heightfield resolution, metres
const GRID = Math.round(WORLD_SIZE / CELL);

export const ROAD_WIDTH = 9;

// The road network: a ring road around the valley plus spurs out to each place.
export const ROADS = [
  // ring
  [[-96, -104], [24, -128], [116, -74], [128, 36], [56, 118], [-64, 122], [-130, 34], [-96, -104]],
  // spurs from the ring into the hub and the landmark pads
  [[0, 0], [-52, -62], [-96, -104]],
  [[0, 0], [62, -78], [116, -74]],
  [[0, 0], [96, 26], [128, 36]],
  [[0, 0], [40, 82], [56, 118]],
  [[0, 0], [-46, 86], [-64, 122]],
  [[0, 0], [-88, 6], [-130, 34]]
];

// Flat circular pads: [x, z, radius, blend]
export const PADS = [
  [0, 0, 30, 12],
  [-96, -104, 26, 12],
  [116, -74, 26, 12],
  [128, 36, 24, 12],
  [56, 118, 26, 12],
  [-64, 122, 24, 12],
  [-130, 34, 22, 12],
  [-40, -118, 22, 12]
];

const smooth = t => t * t * (3 - 2 * t);

function rawHeight(x, z) {
  const d = Math.hypot(x, z);
  return (
    8.5 * Math.sin(x * 0.0125) * Math.cos(z * 0.0112) +
    4.2 * Math.sin(x * 0.031 + 1.7) * Math.sin(z * 0.027 - 0.6) +
    1.5 * Math.sin(x * 0.084 - 0.4) * Math.cos(z * 0.077 + 2.1) +
    // rim of hills so the valley reads as a place, not an endless plain
    Math.max(0, d - 150) * 0.42
  );
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz || 1;
  let t = ((px - ax) * vx + (pz - az) * vz) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + vx * t;
  const cz = az + vz * t;
  return { dist: Math.hypot(px - cx, pz - cz), cx, cz };
}

// Nearest point on the whole network — also used to keep props off the tarmac.
export function nearestRoad(x, z) {
  let best = { dist: Infinity, cx: 0, cz: 0 };
  for (const path of ROADS) {
    for (let i = 0; i < path.length - 1; i++) {
      const hit = distanceToSegment(x, z, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
      if (hit.dist < best.dist) best = hit;
    }
  }
  return best;
}

export function heightAt(x, z) {
  let h = rawHeight(x, z);

  // pads win first: a landmark sits on level ground
  for (const [px, pz, radius, blend] of PADS) {
    const d = Math.hypot(x - px, z - pz);
    if (d > radius + blend) continue;
    const w = d <= radius ? 1 : 1 - smooth((d - radius) / blend);
    h = h * (1 - w) + rawHeight(px, pz) * w;
  }

  // then the roads, carved as a graded corridor
  const road = nearestRoad(x, z);
  const shoulder = ROAD_WIDTH * 0.5 + 8;
  if (road.dist < shoulder) {
    const w = road.dist <= ROAD_WIDTH * 0.5 ? 1 : 1 - smooth((road.dist - ROAD_WIDTH * 0.5) / 8);
    h = h * (1 - w) + heightOnRoad(road.cx, road.cz) * w;
  }
  return h;
}

// Road centreline height: pads applied, but no road term (avoids recursion).
function heightOnRoad(x, z) {
  let h = rawHeight(x, z);
  for (const [px, pz, radius, blend] of PADS) {
    const d = Math.hypot(x - px, z - pz);
    if (d > radius + blend) continue;
    const w = d <= radius ? 1 : 1 - smooth((d - radius) / blend);
    h = h * (1 - w) + rawHeight(px, pz) * w;
  }
  return h;
}

function noiseTexture(size, base, spec) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < spec.count; i++) {
    ctx.fillStyle = spec.colors[(Math.random() * spec.colors.length) | 0];
    const r = spec.min + Math.random() * (spec.max - spec.min);
    ctx.globalAlpha = spec.alpha;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function buildTerrain({ scene, world, groundMaterial, quality }) {
  /* ---------------------------------------------------------- visual mesh */
  const segments = quality.tier === 'low' ? GRID / 2 : GRID;
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const grass = new THREE.Color(0x3d5c40);
  const dry = new THREE.Color(0x5f6742);
  const rock = new THREE.Color(0x6b7280);
  const shade = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const y = heightAt(x, z);
    position.setY(i, y);

    // slope estimate drives the grass -> rock blend
    const slope = Math.abs(heightAt(x + 2, z) - y) + Math.abs(heightAt(x, z + 2) - y);
    shade.copy(grass).lerp(dry, THREE.MathUtils.clamp(y / 26, 0, 1));
    shade.lerp(rock, THREE.MathUtils.clamp(slope * 0.55, 0, 0.85));
    shade.offsetHSL(0, 0, (Math.random() - 0.5) * 0.03);
    colors[i * 3] = shade.r;
    colors[i * 3 + 1] = shade.g;
    colors[i * 3 + 2] = shade.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const groundTex = noiseTexture(256, '#3a4a38', {
    count: 900, min: 1, max: 5, alpha: 0.25,
    colors: ['#2c3a2b', '#46543c', '#586048', '#28331f']
  });
  groundTex.repeat.set(70, 70);

  const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: groundTex,
    roughness: 0.97,
    metalness: 0,
    envMapIntensity: 0.35
  }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  /* ------------------------------------------------------------- physics */
  const matrix = [];
  for (let i = 0; i <= GRID; i++) {
    const row = [];
    const x = -HALF + i * CELL;
    for (let j = 0; j <= GRID; j++) row.push(heightAt(x, HALF - j * CELL));
    matrix.push(row);
  }
  const heightfield = new CANNON.Heightfield(matrix, { elementSize: CELL });
  const body = new CANNON.Body({ mass: 0, material: groundMaterial });
  body.addShape(heightfield);
  body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  body.position.set(-HALF, 0, HALF);
  world.addBody(body);

  /* --------------------------------------------------------------- roads */
  const asphalt = noiseTexture(256, '#23252b', {
    count: 1400, min: 0.6, max: 2.4, alpha: 0.4,
    colors: ['#1b1d22', '#2b2e35', '#33363d']
  });
  asphalt.repeat.set(1, 24);

  const roadMaterial = new THREE.MeshStandardMaterial({
    map: asphalt, color: 0x6e727c, roughness: 0.92, metalness: 0.04, envMapIntensity: 0.25
  });
  const roadGroup = new THREE.Group();

  for (const path of ROADS) {
    const points = [];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i];
      const [bx, bz] = path[i + 1];
      const steps = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 4));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        points.push(new THREE.Vector2(ax + (bx - ax) * t, az + (bz - az) * t));
      }
    }
    points.push(new THREE.Vector2(path[path.length - 1][0], path[path.length - 1][1]));

    const verts = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const dir = new THREE.Vector2(next.x - prev.x, next.y - prev.y).normalize();
      const nx = -dir.y * ROAD_WIDTH * 0.5;
      const nz = dir.x * ROAD_WIDTH * 0.5;
      const p = points[i];
      const yl = heightAt(p.x - nx, p.y - nz) + 0.09;
      const yr = heightAt(p.x + nx, p.y + nz) + 0.09;
      verts.push(p.x - nx, yl, p.y - nz, p.x + nx, yr, p.y + nz);
      const v = i / 3;
      uvs.push(0, v, 1, v);
      if (i < points.length - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const strip = new THREE.BufferGeometry();
    strip.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    strip.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    strip.setIndex(indices);
    strip.computeVertexNormals();
    const mesh = new THREE.Mesh(strip, roadMaterial);
    mesh.receiveShadow = true;
    roadGroup.add(mesh);
  }
  scene.add(roadGroup);

  return { terrain, roadGroup, heightAt, body };
}
