import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DISTRICTS, MILESTONES, PALETTE } from './data.js';

/**
 * Builds the whole static world: sky, terrain, plaza, roads, district
 * landmarks, milestone monuments, floating tech and boost pads.
 *
 * Returns handles the main loop needs: per-frame updaters, the raycastable
 * interactive objects, and the boost pads.
 */
export function buildWorld({ scene, world, groundMaterial, quality }) {
  const updaters = [];
  const interactives = [];
  const boostPads = [];

  const RADIUS = 118;          // outer wall radius
  const PLAZA_RADIUS = 26;

  /* ------------------------------------------------------------------ sky */
  const skyGeo = new THREE.SphereGeometry(320, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#0a1030') },
      middle: { value: new THREE.Color('#111a3a') },
      bottom: { value: new THREE.Color('#05060c') },
      glow: { value: new THREE.Color('#2a3a80') }
    },
    vertexShader: /* glsl */`
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vPos;
      uniform vec3 top; uniform vec3 middle; uniform vec3 bottom; uniform vec3 glow;
      void main() {
        float h = normalize(vPos).y;
        vec3 col = mix(bottom, middle, smoothstep(-0.25, 0.12, h));
        col = mix(col, top, smoothstep(0.1, 0.7, h));
        // horizon bloom
        col += glow * pow(1.0 - abs(h), 8.0) * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.FogExp2(0x141c34, 0.0028);

  /* -------------------------------------------------------------- lighting */
  scene.add(new THREE.HemisphereLight(0x8ea6ff, 0x121829, 1.0));
  scene.add(new THREE.AmbientLight(0x8fa2ff, 0.22));

  const moon = new THREE.DirectionalLight(0xdfe6ff, 2.9);
  moon.position.set(70, 90, 40);
  moon.castShadow = true;
  moon.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  moon.shadow.radius = 2;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.03;
  const d = 100;
  Object.assign(moon.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 320 });
  moon.shadow.camera.updateProjectionMatrix();
  scene.add(moon);

  const fill = new THREE.DirectionalLight(0x4f7cff, 0.7);
  fill.position.set(-60, 40, -50);
  scene.add(fill);

  /* --------------------------------------------------------------- terrain */
  // Deterministic rolling hills outside the drivable plateau.
  const terrainGeo = new THREE.CircleGeometry(RADIUS + 90, 128);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const rise = Math.max(0, (r - RADIUS) / 60);
    const noise =
      Math.sin(x * 0.035) * Math.cos(z * 0.031) * 6 +
      Math.sin(x * 0.011 + z * 0.017) * 11;
    pos.setY(i, rise * rise * (10 + noise));
  }
  terrainGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshStandardMaterial({ color: 0x121a2c, roughness: 1, metalness: 0, flatShading: true })
  );
  terrain.position.y = -0.02;
  terrain.receiveShadow = true;
  scene.add(terrain);

  // flat drivable floor (also the physics ground)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(RADIUS, 96),
    new THREE.MeshStandardMaterial({
      color: 0x18203a, roughness: 0.6, metalness: 0.5,
      envMapIntensity: 1.2
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(RADIUS * 2, 60, 0x2a3560, 0x161d33);
  grid.position.y = 0.015;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);

  const groundBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(RADIUS + 40, 1, RADIUS + 40)),
    material: groundMaterial
  });
  groundBody.position.set(0, -1, 0);
  world.addBody(groundBody);

  // circular boundary made of short static walls
  const WALL_SEGMENTS = 40;
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x161d33, roughness: 0.4, metalness: 0.7,
    emissive: new THREE.Color(PALETTE.indigo), emissiveIntensity: 0.06
  });
  const segLength = (2 * Math.PI * RADIUS) / WALL_SEGMENTS + 1.5;
  const wallGeo = new THREE.BoxGeometry(segLength, 3.4, 1.6);
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, WALL_SEGMENTS);
  walls.castShadow = walls.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < WALL_SEGMENTS; i++) {
    const a = (i / WALL_SEGMENTS) * Math.PI * 2;
    const x = Math.cos(a) * RADIUS;
    const z = Math.sin(a) * RADIUS;
    dummy.position.set(x, 1.7, z);
    dummy.rotation.set(0, -a, 0);
    dummy.updateMatrix();
    walls.setMatrixAt(i, dummy.matrix);

    const body = new CANNON.Body({ mass: 0, material: groundMaterial });
    body.addShape(new CANNON.Box(new CANNON.Vec3(segLength / 2, 1.7, 0.8)));
    body.position.set(x, 1.7, z);
    body.quaternion.setFromEuler(0, -a, 0);
    world.addBody(body);
  }
  scene.add(walls);

  /* ----------------------------------------------------------------- plaza */
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(PLAZA_RADIUS, PLAZA_RADIUS, 0.3, 96),
    new THREE.MeshStandardMaterial({
      color: 0x212b4e, roughness: 0.3, metalness: 0.7, envMapIntensity: 1.8,
      emissive: new THREE.Color(0x16204f), emissiveIntensity: 0.6
    })
  );
  plaza.position.y = 0.14;
  plaza.receiveShadow = true;
  scene.add(plaza);

  const plazaRing = new THREE.Mesh(
    new THREE.RingGeometry(PLAZA_RADIUS - 0.7, PLAZA_RADIUS, 96),
    new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  plazaRing.rotation.x = -Math.PI / 2;
  plazaRing.position.y = 0.31;
  scene.add(plazaRing);
  updaters.push(t => { plazaRing.material.opacity = 0.22 + Math.sin(t * 1.3) * 0.1; });

  /* ----------------------------------------------------------------- roads */
  const roadMat = new THREE.MeshStandardMaterial({ color: PALETTE.road, roughness: 0.75, metalness: 0.3 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.22 });
  for (const district of DISTRICTS) {
    const [dx, , dz] = district.position;
    const length = Math.hypot(dx, dz) - 8;
    const angle = Math.atan2(dx, dz);

    const road = new THREE.Mesh(new THREE.PlaneGeometry(11, length), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -angle;
    road.position.set(Math.sin(angle) * length / 2, 0.05, Math.cos(angle) * length / 2);
    road.receiveShadow = true;
    scene.add(road);

    for (const side of [-5.4, 5.4]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.28, length), edgeMat);
      edge.rotation.x = -Math.PI / 2;
      edge.rotation.z = -angle;
      edge.position.set(
        Math.sin(angle) * length / 2 + Math.cos(angle) * side,
        0.07,
        Math.cos(angle) * length / 2 - Math.sin(angle) * side
      );
      scene.add(edge);
    }
  }

  /* ------------------------------------------------------- district builds */
  for (const district of DISTRICTS) {
    const group = new THREE.Group();
    group.position.set(district.position[0], 0, district.position[2]);
    group.lookAt(0, 0, 0);
    scene.add(group);

    const light = new THREE.PointLight(district.color, quality.tier === 'low' ? 120 : 260, 90, 1.8);
    light.position.set(0, 14, 0);
    group.add(light);

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(15, 15, 0.4, 64),
      new THREE.MeshStandardMaterial({ color: 0x101627, roughness: 0.3, metalness: 0.8 })
    );
    pad.position.y = 0.18;
    pad.receiveShadow = true;
    group.add(pad);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(15.2, 16.4, 64),
      new THREE.MeshBasicMaterial({ color: district.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.4;
    group.add(halo);
    updaters.push(t => { halo.material.opacity = 0.25 + Math.sin(t * 1.6 + district.position[0]) * 0.12; });

    const builder = { rig: buildRig, core: buildCore, grove: buildGrove, arch: buildArch }[district.kind];
    builder({ group, district, updaters, world, groundMaterial, quality, interactives });

    const label = makeLabel(district.name.toUpperCase(), district.color);
    label.position.set(0, 22, 0);
    group.add(label);
    updaters.push(t => { label.position.y = 22 + Math.sin(t * 0.9) * 0.5; });

    interactives.push({
      object: pad,
      kind: 'district',
      id: district.id,
      title: district.name,
      meta: 'District',
      body: district.blurb,
      position: new THREE.Vector3(district.position[0], 0, district.position[2]),
      radius: 16,
      highlight: halo
    });
  }

  /* ----------------------------------------------- milestone monuments ring */
  MILESTONES.forEach((milestone, index) => {
    const angle = (index / MILESTONES.length) * Math.PI * 2;
    const r = PLAZA_RADIUS + 14;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;

    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = -angle;
    scene.add(group);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.6, 0.5, 32),
      new THREE.MeshStandardMaterial({ color: 0x0f1526, roughness: 0.35, metalness: 0.8 })
    );
    base.position.y = 0.25;
    base.receiveShadow = true;
    group.add(base);

    const shard = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.9, 0),
      new THREE.MeshStandardMaterial({
        color: milestone.color, roughness: 0.1, metalness: 0.95,
        emissive: new THREE.Color(milestone.color), emissiveIntensity: 0.35,
        envMapIntensity: 1.6
      })
    );
    shard.position.y = 4.6;
    shard.castShadow = true;
    group.add(shard);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 9, 8),
      new THREE.MeshBasicMaterial({ color: milestone.color, transparent: true, opacity: 0.22 })
    );
    beam.position.y = 4.6;
    group.add(beam);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(4, 4.7, 40),
      new THREE.MeshBasicMaterial({ color: milestone.color, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.55;
    group.add(ring);

    const body = new CANNON.Body({ mass: 0, material: groundMaterial });
    body.addShape(new CANNON.Cylinder(3.2, 3.6, 0.5, 10));
    body.position.set(x, 0.25, z);
    world.addBody(body);

    const seed = index * 1.7;
    updaters.push(t => {
      shard.rotation.y = t * 0.7 + seed;
      shard.rotation.x = Math.sin(t * 0.6 + seed) * 0.25;
      shard.position.y = 4.6 + Math.sin(t * 1.1 + seed) * 0.35;
      ring.material.opacity = 0.2 + Math.sin(t * 1.8 + seed) * 0.1;
    });

    interactives.push({
      object: shard,
      kind: 'milestone',
      id: milestone.id,
      title: milestone.title,
      meta: milestone.meta,
      body: '',
      position: new THREE.Vector3(x, 0, z),
      radius: 7,
      highlight: ring,
      shard
    });
  });

  /* -------------------------------------------------------- floating tech */
  const techCount = quality.tier === 'low' ? 60 : 150;
  const techGeo = new THREE.IcosahedronGeometry(0.65, 0);
  const techMat = new THREE.MeshStandardMaterial({
    color: 0x9fb4ff, roughness: 0.15, metalness: 0.9,
    emissive: new THREE.Color(PALETTE.indigo), emissiveIntensity: 0.25, envMapIntensity: 1.5
  });
  const tech = new THREE.InstancedMesh(techGeo, techMat, techCount);
  const techSeeds = new Float32Array(techCount * 4);
  for (let i = 0; i < techCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 78;
    techSeeds[i * 4] = Math.cos(a) * r;
    techSeeds[i * 4 + 1] = 8 + Math.random() * 26;
    techSeeds[i * 4 + 2] = Math.sin(a) * r;
    techSeeds[i * 4 + 3] = Math.random() * Math.PI * 2;
  }
  scene.add(tech);
  updaters.push(t => {
    for (let i = 0; i < techCount; i++) {
      const seed = techSeeds[i * 4 + 3];
      dummy.position.set(
        techSeeds[i * 4],
        techSeeds[i * 4 + 1] + Math.sin(t * 0.6 + seed) * 1.6,
        techSeeds[i * 4 + 2]
      );
      dummy.rotation.set(t * 0.3 + seed, t * 0.42 + seed, 0);
      dummy.scale.setScalar(0.7 + Math.sin(t + seed) * 0.15);
      dummy.updateMatrix();
      tech.setMatrixAt(i, dummy.matrix);
    }
    tech.instanceMatrix.needsUpdate = true;
  });

  /* ------------------------------------------------------------ boost pads */
  const padPositions = [[0, 44], [44, 0], [0, -44], [-44, 0], [58, 58], [-58, -58]];
  const boostGeo = new THREE.PlaneGeometry(9, 14);
  for (const [px, pz] of padPositions) {
    const mat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.35 });
    const pad = new THREE.Mesh(boostGeo, mat);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = Math.atan2(px, pz);
    pad.position.set(px, 0.09, pz);
    scene.add(pad);
    boostPads.push({ position: new THREE.Vector3(px, 0, pz), radius: 6, mesh: pad });
    updaters.push(t => { mat.opacity = 0.25 + Math.sin(t * 4 + px) * 0.14; });
  }

  /* ----------------------------------------------------------- knockables */
  const knockables = [];
  const crateGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  const crateMats = [PALETTE.indigo, PALETTE.cyan, PALETTE.amber, PALETTE.violet, PALETTE.green].map(color =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55, envMapIntensity: 1.2 })
  );
  const crateCount = quality.tier === 'low' ? 34 : 64;
  for (let i = 0; i < crateCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 32 + Math.random() * 70;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const mesh = new THREE.Mesh(crateGeo, crateMats[i % crateMats.length]);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({
      mass: 14,
      shape: new CANNON.Box(new CANNON.Vec3(0.8, 0.8, 0.8)),
      material: groundMaterial
    });
    body.position.set(x, 0.85, z);
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.4;
    body.sleepTimeLimit = 0.6;
    world.addBody(body);
    knockables.push({ mesh, body });
  }

  // a stack worth demolishing, on the plaza edge
  for (let level = 0; level < 4; level++) {
    for (let i = 0; i <= level; i++) {
      const mesh = new THREE.Mesh(crateGeo, crateMats[level % crateMats.length]);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      const bx = 12 + (i - level / 2) * 1.85;
      const by = (3 - level) * 1.85 + 0.85;
      const body = new CANNON.Body({
        mass: 12,
        shape: new CANNON.Box(new CANNON.Vec3(0.8, 0.8, 0.8)),
        material: groundMaterial
      });
      body.position.set(bx, by, 34);
      body.allowSleep = true;
      body.sleepSpeedLimit = 0.4;
      body.sleepTimeLimit = 0.6;
      world.addBody(body);
      knockables.push({ mesh, body });
    }
  }

  return { updaters, interactives, boostPads, knockables, RADIUS, PLAZA_RADIUS, moon };
}

/* ====================================================== district builders */

function buildRig({ group, district, updaters, world, groundMaterial, interactives }) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a94ad, roughness: 0.35, metalness: 0.95, envMapIntensity: 1.3 });
  const accent = new THREE.MeshStandardMaterial({
    color: district.color, roughness: 0.3, metalness: 0.8,
    emissive: new THREE.Color(district.color), emissiveIntensity: 0.3
  });

  // gantry: four legs + truss deck
  const legGeo = new THREE.BoxGeometry(0.7, 13, 0.7);
  for (const [lx, lz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
    const leg = new THREE.Mesh(legGeo, steel);
    leg.position.set(lx, 6.5, lz);
    leg.castShadow = true;
    group.add(leg);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(13, 0.8, 13), steel);
  deck.position.y = 13.4;
  deck.castShadow = deck.receiveShadow = true;
  group.add(deck);

  // diagonal bracing
  const braceGeo = new THREE.BoxGeometry(0.35, 14.5, 0.35);
  for (let i = 0; i < 4; i++) {
    const brace = new THREE.Mesh(braceGeo, steel);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    brace.position.set(Math.cos(a) * 5, 6.6, Math.sin(a) * 5);
    brace.rotation.z = Math.cos(a) * 0.42;
    brace.rotation.x = Math.sin(a) * 0.42;
    group.add(brace);
  }

  // gears that actually turn
  const gearGroup = new THREE.Group();
  gearGroup.position.set(0, 16.4, 0);
  group.add(gearGroup);
  const gears = [];
  for (const [gx, radius, teeth, speed] of [[-3.4, 3, 14, 0.6], [2.6, 2.2, 11, -0.82]]) {
    const gear = new THREE.Group();
    gear.position.x = gx;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.5, 28), accent);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    gear.add(disc);
    const toothGeo = new THREE.BoxGeometry(0.6, 0.5, 0.9);
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, accent);
      tooth.position.set(Math.cos(a) * (radius + 0.35), Math.sin(a) * (radius + 0.35), 0);
      tooth.rotation.z = a;
      gear.add(tooth);
    }
    gearGroup.add(gear);
    gears.push({ gear, speed });
  }
  updaters.push((t, dt) => gears.forEach(({ gear, speed }) => { gear.rotation.z += speed * dt; }));

  // piston that pumps
  const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 6, 16), steel);
  piston.position.set(6, 8, 0);
  group.add(piston);
  updaters.push(t => { piston.position.y = 8 + Math.sin(t * 2.2) * 1.4; });

  addPillarCollider({ group, world, groundMaterial, radius: 6.4, height: 14 });
}

function buildCore({ group, district, updaters, quality }) {
  const color = new THREE.Color(district.color);

  // suspended neural lattice
  const nodeCount = quality.tier === 'low' ? 40 : 90;
  const nodeGeo = new THREE.SphereGeometry(0.42, 12, 12);
  const nodeMat = new THREE.MeshStandardMaterial({
    color: 0xdfe6ff, roughness: 0.1, metalness: 0.9,
    emissive: color, emissiveIntensity: 0.8
  });
  const nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, nodeCount);
  const points = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < nodeCount; i++) {
    // fibonacci sphere for an even lattice
    const y = 1 - (i / (nodeCount - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * 2.399963;
    const p = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(7.5);
    points.push(p);
    dummy.position.copy(p);
    dummy.updateMatrix();
    nodes.setMatrixAt(i, dummy.matrix);
  }
  const lattice = new THREE.Group();
  lattice.position.y = 13;
  lattice.add(nodes);
  group.add(lattice);

  // connect near neighbours with glowing lines
  const linePositions = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (points[i].distanceTo(points[j]) < 3.4) {
        linePositions.push(points[i].x, points[i].y, points[i].z, points[j].x, points[j].y, points[j].z);
      }
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.32 }));
  lattice.add(lines);

  // inner pulsing core
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(3.2, 1),
    new THREE.MeshStandardMaterial({
      color: 0x0b1030, roughness: 0.05, metalness: 1,
      emissive: color, emissiveIntensity: 1.2, envMapIntensity: 2
    })
  );
  lattice.add(core);

  // orbiting data rings
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(9 + i * 1.6, 0.09, 8, 90),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
    );
    ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    lattice.add(ring);
    rings.push(ring);
  }

  // support column
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.4, 6, 20),
    new THREE.MeshStandardMaterial({ color: 0x2a3358, roughness: 0.3, metalness: 0.9 })
  );
  column.position.y = 3;
  column.castShadow = true;
  group.add(column);

  updaters.push((t, dt) => {
    lattice.rotation.y += dt * 0.14;
    core.rotation.y -= dt * 0.3;
    const pulse = 1 + Math.sin(t * 2.4) * 0.06;
    core.scale.setScalar(pulse);
    core.material.emissiveIntensity = 0.9 + Math.sin(t * 2.4) * 0.5;
    lines.material.opacity = 0.22 + Math.sin(t * 1.7) * 0.12;
    rings.forEach((ring, i) => { ring.rotation.z += dt * (0.2 + i * 0.12); });
  });
}

function buildGrove({ group, district, updaters, world, groundMaterial, quality }) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2f2a36, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({
    color: district.color, roughness: 0.55, metalness: 0.15,
    emissive: new THREE.Color(district.color), emissiveIntensity: 0.12, flatShading: true
  });

  const count = quality.tier === 'low' ? 9 : 16;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.4;
    const r = 6 + (i % 3) * 3.4;
    const tree = new THREE.Group();
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 2.6, 8), trunkMat);
    trunk.position.y = 1.3;
    trunk.castShadow = true;
    tree.add(trunk);

    for (let k = 0; k < 3; k++) {
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.9 - k * 0.45, 2.1, 7), leafMat);
      canopy.position.y = 2.9 + k * 1.15;
      canopy.castShadow = true;
      tree.add(canopy);
    }
    group.add(tree);
    const sway = Math.random() * Math.PI * 2;
    updaters.push(t => { tree.rotation.z = Math.sin(t * 0.9 + sway) * 0.03; });
  }

  // wind turbines
  for (const [tx, tz] of [[-11, -9], [11, -10]]) {
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.6, 16, 14),
      new THREE.MeshStandardMaterial({ color: 0xc9d2e6, roughness: 0.35, metalness: 0.6 })
    );
    tower.position.set(tx, 8, tz);
    tower.castShadow = true;
    group.add(tower);

    const hub = new THREE.Group();
    hub.position.set(tx, 16, tz);
    group.add(hub);
    const bladeGeo = new THREE.BoxGeometry(0.22, 7, 0.7);
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(bladeGeo, new THREE.MeshStandardMaterial({ color: 0xe8eefc, roughness: 0.3, metalness: 0.4 }));
      blade.position.y = 3.5;
      blade.castShadow = true;
      const arm = new THREE.Group();
      arm.rotation.z = (b / 3) * Math.PI * 2;
      arm.add(blade);
      hub.add(arm);
    }
    updaters.push((t, dt) => { hub.rotation.z += dt * 1.1; });
  }

  // solar array
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x0a1230, roughness: 0.08, metalness: 1, envMapIntensity: 2.2
  });
  for (let i = 0; i < 4; i++) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(5, 0.16, 3), panelMat);
    panel.position.set(-4 + i * 3.4, 1.8, 11);
    panel.rotation.x = -0.5;
    panel.castShadow = panel.receiveShadow = true;
    group.add(panel);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.8, 8), trunkMat);
    stand.position.set(-4 + i * 3.4, 0.9, 11);
    group.add(stand);
    updaters.push(t => { panel.rotation.z = Math.sin(t * 0.4 + i) * 0.06; });
  }

  addPillarCollider({ group, world, groundMaterial, radius: 4, height: 8 });
}

function buildArch({ group, district, updaters, world, groundMaterial }) {
  const color = new THREE.Color(district.color);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xb9c4e6, roughness: 0.12, metalness: 1,
    emissive: color, emissiveIntensity: 0.18, envMapIntensity: 1.8
  });

  const arch = new THREE.Mesh(new THREE.TorusGeometry(9, 0.85, 20, 64, Math.PI), mat);
  arch.position.y = 0.2;
  arch.castShadow = true;
  group.add(arch);

  const arch2 = arch.clone();
  arch2.rotation.y = Math.PI / 2;
  group.add(arch2);

  // an idea suspended in the middle of the arch
  const idea = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.4, 0),
    new THREE.MeshStandardMaterial({
      color, roughness: 0.05, metalness: 1,
      emissive: color, emissiveIntensity: 1.1, envMapIntensity: 2
    })
  );
  idea.position.y = 9;
  idea.castShadow = true;
  group.add(idea);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(4, 0.06, 8, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 })
  );
  halo.position.y = 9;
  halo.rotation.x = Math.PI / 2.4;
  group.add(halo);

  updaters.push((t, dt) => {
    idea.rotation.y += dt * 0.6;
    idea.rotation.x = Math.sin(t * 0.7) * 0.3;
    idea.position.y = 9 + Math.sin(t * 1.2) * 0.6;
    idea.material.emissiveIntensity = 0.8 + Math.sin(t * 3) * 0.4;
    halo.rotation.z += dt * 0.5;
    halo.position.y = idea.position.y;
  });

  // arch legs are solid
  for (const lx of [-9, 9]) {
    const body = new CANNON.Body({ mass: 0, material: groundMaterial });
    body.addShape(new CANNON.Box(new CANNON.Vec3(1, 4, 1)));
    const world4 = new THREE.Vector3(lx, 4, 0).applyQuaternion(group.quaternion).add(group.position);
    body.position.set(world4.x, world4.y, world4.z);
    world.addBody(body);
  }
}

function addPillarCollider({ group, world, groundMaterial, radius, height }) {
  const body = new CANNON.Body({ mass: 0, material: groundMaterial });
  body.addShape(new CANNON.Cylinder(radius, radius, height, 12));
  body.position.set(group.position.x, height / 2, group.position.z);
  world.addBody(body);
}

/* ------------------------------------------------------------------ label */
export function makeLabel(text, color = 0xffffff, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 82px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#' + new THREE.Color(color).getHexString();
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(26 * scale, 4 * scale, 1);
  return sprite;
}
