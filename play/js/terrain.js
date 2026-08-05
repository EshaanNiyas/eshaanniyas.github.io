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

// Water: each lake is an elliptical basin carved out of the hills, with a
// shore blend that keeps the banks drivable.
export const LAKES = [
  { x: 74, z: -18, rx: 27, rz: 21, depth: 6.5 },
  { x: -84, z: 58, rx: 18, rz: 14, depth: 5.5 }
];

// A ravine that the ring road crosses on a bridge.
export const RAVINE = { a: [6, -172], b: [66, -68], width: 12, depth: 13 };
export const BRIDGES = [{ x: 44, z: -104, span: 40 }];

const smooth = t => t * t * (3 - 2 * t);

function basin(x, z, h) {
  for (const lake of LAKES) {
    const d = Math.hypot((x - lake.x) / lake.rx, (z - lake.z) / lake.rz);
    if (d > 1.6) continue;
    const w = d <= 1 ? 1 : 1 - smooth((d - 1) / 0.6);
    h -= lake.depth * w;
  }
  const gully = distanceToSegment(x, z, RAVINE.a[0], RAVINE.a[1], RAVINE.b[0], RAVINE.b[1]);
  if (gully.dist < RAVINE.width * 2.2) {
    const w = gully.dist <= RAVINE.width ? 1 : 1 - smooth((gully.dist - RAVINE.width) / (RAVINE.width * 1.2));
    h -= RAVINE.depth * w;
  }
  return h;
}

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

export function waterLevelAt(lake) {
  return rawHeight(lake.x, lake.z) - lake.depth * 0.45;
}

export function heightAt(x, z) {
  let h = basin(x, z, rawHeight(x, z));

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

  /* --------------------------------------------------------------- water */
  const waterUpdaters = [];
  const waterGroup = new THREE.Group();
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x123449,
    roughness: 0.08,
    metalness: 0.35,
    envMapIntensity: 2.4,
    transparent: true,
    opacity: 0.88
  });

  for (const lake of LAKES) {
    const level = waterLevelAt(lake);
    const surface = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      waterMat
    );
    surface.rotation.x = -Math.PI / 2;
    surface.scale.set(lake.rx * 1.02, lake.rz * 1.02, 1);
    surface.position.set(lake.x, level, lake.z);
    waterGroup.add(surface);

    // a slow swell, done on the transform so there is no custom shader to compile
    waterUpdaters.push(t => {
      surface.position.y = level + Math.sin(t * 0.7) * 0.05;
      surface.rotation.z = Math.sin(t * 0.13) * 0.04;
    });

    // a pale rim so the shoreline reads clearly from the road
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1.06, 64),
      new THREE.MeshBasicMaterial({ color: 0x7fd4e8, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.scale.set(lake.rx, lake.rz, 1);
    rim.position.set(lake.x, level + 0.06, lake.z);
    waterGroup.add(rim);
  }
  scene.add(waterGroup);

  /* -------------------------------------------------------------- bridges */
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x2c3140, roughness: 0.6, metalness: 0.45, envMapIntensity: 1.1 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc6d2e6, roughness: 0.35, metalness: 0.7, envMapIntensity: 1.6 });

  for (const bridge of BRIDGES) {
    const road = nearestRoad(bridge.x, bridge.z);
    const deckY = heightOnRoad(road.cx, road.cz);
    // align the deck with the road, sampled a few metres either side
    const ahead = nearestRoad(bridge.x + 6, bridge.z + 6);
    const behind = nearestRoad(bridge.x - 6, bridge.z - 6);
    const angle = Math.atan2(-(ahead.cz - behind.cz), ahead.cx - behind.cx);

    const group = new THREE.Group();
    group.position.set(road.cx, deckY, road.cz);
    group.rotation.y = angle;

    // deck edges either side of the road surface
    for (const side of [-1, 1]) {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(bridge.span, 0.5, 1.1), deckMat);
      kerb.position.set(0, -0.1, side * (ROAD_WIDTH * 0.5 + 0.45));
      kerb.castShadow = kerb.receiveShadow = true;
      group.add(kerb);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(bridge.span, 0.12, 0.12), railMat);
      rail.position.set(0, 1.1, side * (ROAD_WIDTH * 0.5 + 0.45));
      group.add(rail);

      const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1.2, 0.16), railMat, 9);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < 9; i++) {
        dummy.position.set(-bridge.span / 2 + (i / 8) * bridge.span, 0.5, side * (ROAD_WIDTH * 0.5 + 0.45));
        dummy.updateMatrix();
        posts.setMatrixAt(i, dummy.matrix);
      }
      posts.castShadow = true;
      group.add(posts);
    }

    // piers dropping into the ravine
    for (const offset of [-bridge.span * 0.28, bridge.span * 0.28]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.8, 16, 3.4), deckMat);
      pier.position.set(offset, -8.2, 0);
      pier.castShadow = true;
      group.add(pier);
    }

    // underside so the deck is not a floating ribbon
    const soffit = new THREE.Mesh(new THREE.BoxGeometry(bridge.span, 0.7, ROAD_WIDTH + 1.6), deckMat);
    soffit.position.y = -0.55;
    soffit.receiveShadow = true;
    group.add(soffit);

    scene.add(group);
  }

  return { terrain, roadGroup, heightAt, body, updaters: waterUpdaters };
}
