// Landmarks. Each place gets a silhouette you can recognise from the road, a
// holographic display that wakes up as you approach, and a physics footprint.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PLACES, SIGNS } from './data.js';
import { heightAt } from './terrain.js';

const updaters = [];
const statics = [];

function addStaticBox(world, position, halfExtents, quaternion) {
  const body = new CANNON.Body({ mass: 0 });
  body.addShape(new CANNON.Box(new CANNON.Vec3(...halfExtents)));
  body.position.set(...position);
  if (quaternion) body.quaternion.copy(quaternion);
  world.addBody(body);
  statics.push(body);
}

function addPointLight(group, color, intensity, distance, y) {
  const light = new THREE.PointLight(color, intensity, distance);
  light.position.y = y;
  group.add(light);
  return light;
}

function addStaticCylinder(world, position, radius, height) {
  const body = new CANNON.Body({ mass: 0 });
  body.addShape(new CANNON.Cylinder(radius, radius, height, 10));
  body.position.set(...position);
  world.addBody(body);
}

export function textPlane(lines, { width = 512, height = 256, color = '#eaf2ff', accent = '#22d3ee', size = 1 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(6,10,22,0.62)';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, width - 12, height - 12);

  let y = 66;
  lines.forEach((line, index) => {
    const big = index === 0;
    ctx.fillStyle = big ? color : 'rgba(226,235,255,0.72)';
    ctx.font = `${big ? 700 : 400} ${big ? 46 : 26}px "Space Grotesk", system-ui, sans-serif`;
    ctx.fillText(line, 30, y);
    y += big ? 58 : 36;
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.94, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width / 64 * size, height / 64 * size), material);
  return mesh;
}

/* ------------------------------------------------------------ landmarks */

function buildMonument(group, color, world, x, z, y) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.7, metalness: 0.3, envMapIntensity: 1 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 2, 8), stone);
  base.position.y = 1;
  base.castShadow = base.receiveShadow = true;
  group.add(base);

  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(9 - i * 2, 1.2, 9 - i * 2), stone);
    step.position.y = 2.6 + i * 1.2;
    step.castShadow = step.receiveShadow = true;
    group.add(step);
  }

  const obelisk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 2.1, 22, 4),
    new THREE.MeshStandardMaterial({ color: 0x171b26, roughness: 0.25, metalness: 0.85, envMapIntensity: 1.6 })
  );
  obelisk.position.y = 17;
  obelisk.castShadow = true;
  group.add(obelisk);

  const crown = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.2, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.6 })
  );
  crown.position.y = 30;
  group.add(crown);
  addPointLight(group, color, 60, 60, 26);

  updaters.push((t) => {
    crown.rotation.y = t * 0.5;
    crown.position.y = 30 + Math.sin(t * 1.1) * 0.5;
  });

  addStaticCylinder(world, [x, y + 3, z], 8, 6);
  return 34;
}

function buildLab(group, color, world, x, z, y) {
  const shell = new THREE.MeshStandardMaterial({ color: 0x1b2130, roughness: 0.35, metalness: 0.7, envMapIntensity: 1.4 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x7fd8ff, roughness: 0.08, metalness: 0, transmission: 0.6,
    transparent: true, opacity: 0.35, envMapIntensity: 1.6
  });

  const slab = new THREE.Mesh(new THREE.BoxGeometry(30, 1.2, 20), shell);
  slab.position.y = 0.6;
  slab.receiveShadow = true;
  group.add(slab);

  const block = new THREE.Mesh(new THREE.BoxGeometry(22, 9, 14), shell);
  block.position.y = 5.7;
  block.castShadow = block.receiveShadow = true;
  group.add(block);

  const band = new THREE.Mesh(new THREE.BoxGeometry(22.4, 3.2, 14.4), glass);
  band.position.y = 6.4;
  group.add(band);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(7, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  dome.position.y = 10.2;
  group.add(dome);

  // a neural core turning inside the dome
  const core = new THREE.Group();
  core.position.y = 12;
  const nodeGeo = new THREE.IcosahedronGeometry(0.32, 0);
  const nodeMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4, roughness: 0.3 });
  const nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, 60);
  const dummy = new THREE.Object3D();
  const linkPoints = [];
  for (let i = 0; i < 60; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / 60);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const p = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta), Math.cos(phi) * 0.7, Math.sin(phi) * Math.sin(theta)
    ).multiplyScalar(3.6);
    dummy.position.copy(p);
    dummy.updateMatrix();
    nodes.setMatrixAt(i, dummy.matrix);
    if (i % 3 === 0) linkPoints.push(p, new THREE.Vector3(0, 0, 0));
  }
  core.add(nodes);
  core.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(linkPoints),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 })
  ));
  const heart = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 3, roughness: 0.2 })
  );
  core.add(heart);
  group.add(core);
  addPointLight(group, color, 90, 50, 12);

  // service masts with blinking status lights
  for (const side of [-13, 13]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 16, 8), shell);
    mast.position.set(side, 8, -8);
    mast.castShadow = true;
    group.add(mast);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xff5533, emissive: 0xff3311, emissiveIntensity: 3 })
    );
    bulb.position.set(side, 16.2, -8);
    group.add(bulb);
    updaters.push(t => { bulb.material.emissiveIntensity = 1 + Math.abs(Math.sin(t * 2)) * 4; });
  }

  updaters.push((t) => {
    core.rotation.y = t * 0.35;
    heart.scale.setScalar(1 + Math.sin(t * 2.4) * 0.12);
  });

  addStaticBox(world, [x, y + 5, z], [11, 6, 7]);
  return 18;
}

function buildPavilion(group, color, world, x, z, y) {
  const frame = new THREE.MeshStandardMaterial({ color: 0x232838, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.6 });
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.8, 8), frame);
  floor.position.y = 0.4;
  floor.receiveShadow = true;
  group.add(floor);

  // eight columns holding a faceted roof
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 12, 8), frame);
    column.position.set(Math.cos(a) * 13, 6.4, Math.sin(a) * 13);
    column.castShadow = true;
    group.add(column);
    addStaticCylinder(world, [x + Math.cos(a) * 13, y + 6, z + Math.sin(a) * 13], 0.8, 12);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(17, 6, 8), frame);
  roof.position.y = 15.4;
  roof.castShadow = true;
  group.add(roof);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(11, 0.22, 8, 60),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 12.6;
  group.add(ring);

  // the idea: a slowly turning prototype under the roof
  const idea = new THREE.Mesh(
    new THREE.TorusKnotGeometry(2.4, 0.55, 120, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 1.6, metalness: 0.9, roughness: 0.15 })
  );
  idea.position.y = 7.5;
  idea.castShadow = true;
  group.add(idea);
  addPointLight(group, color, 80, 46, 9);

  updaters.push((t) => {
    idea.rotation.set(t * 0.4, t * 0.7, 0);
    idea.position.y = 7.5 + Math.sin(t) * 0.4;
    ring.rotation.z = t * 0.3;
  });
  return 20;
}

function buildStage(group, color, world, x, z, y) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x2a2e3b, roughness: 0.85, metalness: 0.15 });
  // tiered semicircular seating
  for (let i = 0; i < 5; i++) {
    const tier = new THREE.Mesh(
      new THREE.CylinderGeometry(10 + i * 3, 10 + i * 3, 1.4, 40, 1, false, Math.PI * 0.15, Math.PI * 1.7),
      stone
    );
    tier.position.y = 0.7 + i * 1.4;
    tier.receiveShadow = tier.castShadow = true;
    group.add(tier);
  }
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1, 32), new THREE.MeshStandardMaterial({
    color: 0x1a1e2a, roughness: 0.4, metalness: 0.6, envMapIntensity: 1.4
  }));
  deck.position.y = 1;
  deck.receiveShadow = true;
  group.add(deck);

  // a lectern with a beam of light on it
  const lectern = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.9), stone);
  lectern.position.set(0, 2.2, 2);
  lectern.castShadow = true;
  group.add(lectern);

  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(4.5, 16, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.set(0, 10, 2);
  group.add(beam);
  const spot = new THREE.SpotLight(color, 200, 40, 0.4, 0.6);
  spot.position.set(0, 18, 2);
  spot.target.position.set(0, 1, 2);
  group.add(spot, spot.target);

  // flag masts around the rim
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * 0.2 + (i / 5) * Math.PI * 1.6;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 12, 6), stone);
    mast.position.set(Math.cos(a) * 24, 6, Math.sin(a) * 24);
    mast.castShadow = true;
    group.add(mast);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 1.8, 6, 1),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12, side: THREE.DoubleSide, roughness: 0.85 })
    );
    flag.position.set(Math.cos(a) * 24 + 1.5, 10.6, Math.sin(a) * 24);
    group.add(flag);
    updaters.push(t => { flag.rotation.y = Math.sin(t * 1.6 + i) * 0.25; });
  }

  updaters.push(t => { beam.material.opacity = 0.07 + Math.sin(t * 1.4) * 0.02; });
  addStaticCylinder(world, [x, y + 2, z], 9.5, 4);
  return 22;
}

function buildField(group, color, world, x, z, y) {
  const metal = new THREE.MeshStandardMaterial({ color: 0xd8e2ef, roughness: 0.4, metalness: 0.5, envMapIntensity: 1.2 });

  // wind turbines
  for (const [tx, tz, scale] of [[-14, -6, 1], [10, -14, 0.85], [16, 8, 1.1]]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * scale, 0.9 * scale, 26 * scale, 12), metal);
    tower.position.set(tx, 13 * scale, tz);
    tower.castShadow = true;
    group.add(tower);

    const hub = new THREE.Group();
    hub.position.set(tx, 26 * scale, tz + 1);
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 11 * scale, 0.9), metal);
      blade.position.y = 5.5 * scale;
      blade.castShadow = true;
      const arm = new THREE.Group();
      arm.rotation.z = (b / 3) * Math.PI * 2;
      arm.add(blade);
      hub.add(arm);
    }
    group.add(hub);
    updaters.push((t, dt) => { hub.rotation.z += dt * 0.9 * (1 / scale); });
    addStaticCylinder(world, [x + tx, y + 6, z + tz], 1.2 * scale, 12);
  }

  // solar array
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x13306b, roughness: 0.15, metalness: 0.85, envMapIntensity: 1.8 });
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(5.5, 0.18, 3.2), panelMat, 12);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 12; i++) {
    dummy.position.set(-12 + (i % 4) * 7, 1.6, 6 + Math.floor(i / 4) * 5);
    dummy.rotation.set(-0.5, 0, 0);
    dummy.updateMatrix();
    panels.setMatrixAt(i, dummy.matrix);
  }
  panels.castShadow = true;
  group.add(panels);

  // a grove of low trees, with a glowing seed at the centre
  const seed = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.6, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 2.4, roughness: 0.3 })
  );
  seed.position.set(0, 4, 0);
  group.add(seed);
  addPointLight(group, color, 70, 40, 5);
  updaters.push(t => {
    seed.rotation.y = t * 0.6;
    seed.position.y = 4 + Math.sin(t * 1.3) * 0.35;
  });
  return 18;
}

function buildObservatory(group, color, world, x, z, y) {
  const shell = new THREE.MeshStandardMaterial({ color: 0x232a3a, roughness: 0.4, metalness: 0.6, envMapIntensity: 1.4 });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(8, 9, 8, 24), shell);
  drum.position.y = 4;
  drum.castShadow = drum.receiveShadow = true;
  group.add(drum);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(8, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xc9d4e6, roughness: 0.25, metalness: 0.8, envMapIntensity: 1.8 }));
  dome.position.y = 8;
  dome.castShadow = true;
  group.add(dome);

  // the telescope and its beam share a pivot so they always point together
  const pivot = new THREE.Group();
  pivot.position.set(0, 12, 0);
  group.add(pivot);

  const tilt = new THREE.Group();
  tilt.rotation.z = 0.7;
  pivot.add(tilt);

  const scope = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 12, 16), shell);
  scope.position.y = 5;
  scope.castShadow = true;
  tilt.add(scope);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 2.4, 80, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.position.y = 48;
  tilt.add(beam);

  updaters.push((t) => {
    pivot.rotation.y = Math.sin(t * 0.12) * 1.2;
    tilt.rotation.z = 0.55 + Math.sin(t * 0.2) * 0.18;
    beam.material.opacity = 0.08 + Math.sin(t * 1.5) * 0.03;
  });

  addStaticCylinder(world, [x, y + 4, z], 8.5, 8);
  return 22;
}

function buildAthletics(group, color, world, x, z, y) {
  const turf = new THREE.Mesh(
    new THREE.CircleGeometry(17, 40),
    new THREE.MeshStandardMaterial({ color: 0x1f4d2c, roughness: 0.95 })
  );
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = 0.08;
  turf.receiveShadow = true;
  group.add(turf);

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xdfe9f5, transparent: true, opacity: 0.5 });
  const track = new THREE.Mesh(new THREE.RingGeometry(15.2, 16.6, 48), lineMat);
  track.rotation.x = -Math.PI / 2;
  track.position.y = 0.12;
  group.add(track);

  // floodlights
  const pole = new THREE.MeshStandardMaterial({ color: 0x2c3040, roughness: 0.5, metalness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 18, 8), pole);
    mast.position.set(Math.cos(a) * 19, 9, Math.sin(a) * 19);
    mast.castShadow = true;
    group.add(mast);
    const head = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xfff0c0, emissiveIntensity: 2.2 }));
    head.position.set(Math.cos(a) * 18, 18.4, Math.sin(a) * 18);
    head.lookAt(0, 0, 0);
    group.add(head);
    addStaticCylinder(world, [x + Math.cos(a) * 19, y + 6, z + Math.sin(a) * 19], 0.6, 12);
  }
  const light = new THREE.PointLight(0xfff0cc, 120, 60);
  light.position.y = 16;
  group.add(light);

  // goalposts
  const bar = new THREE.MeshStandardMaterial({ color: 0xe8eef7, roughness: 0.5, metalness: 0.3 });
  for (const side of [-1, 1]) {
    const post = new THREE.Group();
    for (const dx of [-2.4, 2.4]) {
      const upright = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 7, 8), bar);
      upright.position.set(dx, 3.5, 0);
      upright.castShadow = true;
      post.add(upright);
    }
    const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.8, 8), bar);
    cross.rotation.z = Math.PI / 2;
    cross.position.y = 4.6;
    post.add(cross);
    post.position.set(0, 0, side * 13);
    group.add(post);
  }

  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 1.2, roughness: 0.5 })
  );
  ball.position.set(0, 3.2, 0);
  group.add(ball);
  updaters.push((t) => {
    ball.position.y = 3.2 + Math.abs(Math.sin(t * 2)) * 2.4;
    ball.rotation.x = t * 1.4;
  });
  return 14;
}

function buildHub(group, color, world) {
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(24, 24, 0.5, 64),
    new THREE.MeshStandardMaterial({ color: 0x1e2740, roughness: 0.42, metalness: 0.55, envMapIntensity: 0.8 })
  );
  plaza.position.y = 0.25;
  plaza.receiveShadow = true;
  group.add(plaza);

  const inlay = new THREE.Mesh(
    new THREE.RingGeometry(15.4, 16, 80),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 })
  );
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.y = 0.52;
  group.add(inlay);

  // a slowly rotating armature of rings: the "everything connects" centrepiece
  const armature = new THREE.Group();
  armature.position.y = 12;
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(9 - i * 2, 0.24, 10, 90),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: color, emissiveIntensity: 1.8, metalness: 0.9, roughness: 0.15
      })
    );
    ring.rotation.set(Math.PI / 2 * i, i * 0.7, i * 0.4);
    armature.add(ring);
  }
  const centre = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.6, 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 2.6, roughness: 0.2, metalness: 0.5 })
  );
  armature.add(centre);
  group.add(armature);
  addPointLight(group, color, 140, 70, 10);

  updaters.push((t) => {
    armature.rotation.y = t * 0.25;
    armature.children.forEach((child, i) => { child.rotation.z = t * (0.3 + i * 0.15); });
    centre.scale.setScalar(1 + Math.sin(t * 1.8) * 0.08);
  });
  return 14;
}

const BUILDERS = {
  hub: buildHub,
  monument: buildMonument,
  lab: buildLab,
  pavilion: buildPavilion,
  stage: buildStage,
  field: buildField,
  observatory: buildObservatory,
  athletics: buildAthletics
};

/* ------------------------------------------------------------------ API */

export function buildPlaces({ scene, world }) {
  updaters.length = 0;
  const places = [];

  for (const place of PLACES) {
    const [x, z] = place.position;
    const y = heightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    scene.add(group);

    const displayHeight = BUILDERS[place.kind](group, place.color, world, x, z, y);

    // holographic display board, always facing the middle of the map
    const lines = [place.name, place.meta];
    const board = textPlane(lines, { accent: `#${place.color.toString(16).padStart(6, '0')}`, size: 1.1 });
    board.position.set(0, displayHeight, 0);
    board.lookAt(0, displayHeight, 0);
    if (place.id === 'hub') board.visible = false;
    group.add(board);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(place.radius - 1.2, place.radius, 64),
      new THREE.MeshBasicMaterial({ color: place.color, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.3;
    group.add(halo);

    places.push({
      ...place,
      group,
      board,
      halo,
      world: new THREE.Vector3(x, y, z),
      displayHeight
    });
  }

  /* --------------------------------------------------------- road signs */
  for (const sign of SIGNS) {
    const [x, z] = sign.position;
    const y = heightAt(x, z);
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2f3d, roughness: 0.5, metalness: 0.6 })
    );
    post.position.set(x, y + 2.5, z);
    post.castShadow = true;
    scene.add(post);

    const panel = textPlane([sign.text], { width: 512, height: 128, size: 0.55 });
    panel.position.set(x, y + 5.6, z);
    panel.rotation.y = sign.rotation;
    scene.add(panel);
    updaters.push(t => { panel.material.opacity = 0.75 + Math.sin(t * 2 + x) * 0.15; });
  }

  return { places, updaters, statics };
}
