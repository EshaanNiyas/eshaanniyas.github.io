// The car: a GLB 911 (CC BY-SA, Karol Miklas / Lionsharp Studios) bolted onto a
// cannon-es raycast vehicle, plus headlights, brake lights, dust and skid marks.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const WHEEL_RADIUS = 0.34;
const REST_LENGTH = 0.28;
const WHEEL_Y = -0.3;      // wheel centre height in model space
const WHEEL_X = 0.86;
const AXLE_FRONT = 1.27;
const AXLE_REAR = -1.17;
export const RIDE_HEIGHT = 0.66;

// Meshes holding both wheels of an axle, split left/right at load time.
const AXLES = [
  { prefix: 'Cylinder001', z: AXLE_FRONT },
  { prefix: 'Cylinder000', z: AXLE_REAR }
];

export function loadCarModel(onProgress) {
  const draco = new DRACOLoader().setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  return new Promise((resolve, reject) => {
    loader.load('./assets/car/porsche911.glb', gltf => resolve(gltf.scene), onProgress, reject);
  });
}

// Split a baked two-wheel geometry into the half on the requested side and
// re-centre it on that wheel's hub so it can spin and steer.
function halfGeometry(geometry, side, z) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = source.attributes.position;
  const keep = [];
  for (let t = 0; t < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    if (Math.sign(cx) === side) keep.push(t, t + 1, t + 2);
  }
  if (!keep.length) return null;

  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(source.attributes)) {
    const attr = source.attributes[name];
    const size = attr.itemSize;
    const data = new Float32Array(keep.length * size);
    keep.forEach((index, i) => {
      for (let c = 0; c < size; c++) data[i * size + c] = attr.array[index * size + c];
    });
    out.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  out.translate(-side * WHEEL_X, -WHEEL_Y, -z);
  return out;
}

export function createCar({ scene, world, groundMaterial, model, quality, spawn }) {
  model.updateMatrixWorld(true);

  const body = new THREE.Group();
  const wheels = [
    new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()
  ];
  const brakeLights = [];
  const wheelSources = new Map();

  model.traverse(node => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
    const material = node.material;
    material.envMapIntensity = 1.6;
    if (material.name === 'paint') {
      material.roughness = 0.28;
      material.metalness = 0.75;
      material.color = new THREE.Color(0x131a2c);
    }
    if (material.name === 'coat') {
      material.roughness = 0.06;
      material.transparent = true;
      material.opacity = 0.55;
    }
    if (material.name === 'glass' || material.name === 'window') {
      material.transparent = true;
      material.opacity = 0.42;
      material.roughness = 0.05;
      material.metalness = 0.2;
    }
    if (material.name === 'rubber') material.roughness = 0.95;

    const axle = AXLES.find(item => node.name.startsWith(item.prefix));
    if (axle) {
      wheelSources.set(node.name, { geometry, material, axle });
      return;
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    if (material.name === 'lights') {
      material.emissive = new THREE.Color(0xff2222);
      material.emissiveIntensity = 0.6;
      brakeLights.push(material);
    }
    // the duplicated clearcoat shells are pure cost on weak hardware
    if (quality.tier === 'low' && material.name === 'coat') return;
    body.add(mesh);
  });

  // wheels: [front-left, front-right, rear-left, rear-right]
  for (const { geometry, material, axle } of wheelSources.values()) {
    const front = axle.z > 0;
    for (const side of [-1, 1]) {
      const half = halfGeometry(geometry, side, axle.z);
      if (!half) continue;
      const mesh = new THREE.Mesh(half, material);
      mesh.castShadow = true;
      const index = (front ? 0 : 2) + (side < 0 ? 0 : 1);
      wheels[index].add(mesh);
    }
  }

  const car = new THREE.Group();
  car.add(body);
  scene.add(car);
  for (const wheel of wheels) scene.add(wheel);

  /* ------------------------------------------------------------- lighting */
  const headlightTargets = [];
  for (const side of [-0.62, 0.62]) {
    const spot = new THREE.SpotLight(0xf3f7ff, quality.tier === 'low' ? 90 : 160, 62, 0.44, 0.5, 1.6);
    spot.position.set(side, 0.05, 1.8);
    const target = new THREE.Object3D();
    target.position.set(side * 1.6, -1.4, 26);
    car.add(spot, target);
    spot.target = target;
    headlightTargets.push(spot);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 16),
      new THREE.MeshBasicMaterial({ color: 0xdfeaff, transparent: true, opacity: 0.9 })
    );
    glow.position.set(side, 0.06, 1.79);
    car.add(glow);
  }

  const tailGlow = new THREE.PointLight(0xff2a2a, 0, 6);
  tailGlow.position.set(0, 0.05, -2.2);
  car.add(tailGlow);

  /* -------------------------------------------------------------- physics */
  const chassisShape = new CANNON.Box(new CANNON.Vec3(0.92, 0.34, 2.05));
  const chassisBody = new CANNON.Body({ mass: 1300, material: groundMaterial });
  chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0.05, 0));
  chassisBody.position.copy(spawn);
  chassisBody.angularDamping = 0.35;

  const vehicle = new CANNON.RaycastVehicle({
    chassisBody,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2
  });

  const wheelOptions = {
    radius: WHEEL_RADIUS,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    suspensionStiffness: 42,
    suspensionRestLength: REST_LENGTH,
    frictionSlip: 3.2,
    dampingRelaxation: 2.6,
    dampingCompression: 4.6,
    maxSuspensionForce: 100000,
    rollInfluence: 0.03,
    maxSuspensionTravel: 0.32,
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true
  };

  for (const [x, z] of [[-WHEEL_X, AXLE_FRONT], [WHEEL_X, AXLE_FRONT], [-WHEEL_X, AXLE_REAR], [WHEEL_X, AXLE_REAR]]) {
    vehicle.addWheel({
      ...wheelOptions,
      chassisConnectionPointLocal: new CANNON.Vec3(x, WHEEL_Y + REST_LENGTH, z)
    });
  }
  vehicle.addToWorld(world);

  function reset(position, heading = 0) {
    chassisBody.position.set(position.x, position.y, position.z);
    chassisBody.velocity.setZero();
    chassisBody.angularVelocity.setZero();
    chassisBody.quaternion.setFromEuler(0, heading, 0);
    chassisBody.wakeUp();
  }

  function setBraking(on, reversing) {
    const intensity = on ? 1 : reversing ? 0.5 : 0;
    for (const material of brakeLights) material.emissiveIntensity = 0.6 + intensity * 5;
    tailGlow.intensity = intensity * 8;
  }

  return { car, body, wheels, vehicle, chassisBody, reset, setBraking, headlights: headlightTargets };
}

/* ------------------------------------------------------------ skid marks */
// A ring buffer of flat quads dropped under the rear wheels while sliding.
export function createSkidMarks(scene, count = 320) {
  const geometry = new THREE.PlaneGeometry(0.32, 0.9);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x0b0b0d, transparent: true, opacity: 0.55, depthWrite: false
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);

  const dummy = new THREE.Object3D();
  let cursor = 0;
  let filled = 0;

  return {
    mesh,
    drop(position, heading) {
      dummy.position.set(position.x, position.y + 0.03, position.z);
      dummy.rotation.set(0, heading, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(cursor, dummy.matrix);
      cursor = (cursor + 1) % count;
      filled = Math.min(count, filled + 1);
      mesh.count = filled;
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() { filled = 0; cursor = 0; mesh.count = 0; }
  };
}

/* ------------------------------------------------------------------ dust */
export function createDust(scene, count = 260) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const life = new Float32Array(count);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const sprite = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(220,214,196,0.85)');
    gradient.addColorStop(1, 'rgba(220,214,196,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  })();

  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 1.5, map: sprite, transparent: true, opacity: 0.5, depthWrite: false
  }));
  points.frustumCulled = false;
  scene.add(points);

  let cursor = 0;
  return {
    points,
    emit(x, y, z, strength) {
      const n = cursor = (cursor + 1) % count;
      positions[n * 3] = x + (Math.random() - 0.5) * 0.4;
      positions[n * 3 + 1] = y + 0.1;
      positions[n * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
      velocities[n * 3] = (Math.random() - 0.5) * strength;
      velocities[n * 3 + 1] = Math.random() * strength * 0.7 + 0.4;
      velocities[n * 3 + 2] = (Math.random() - 0.5) * strength;
      life[n] = 1;
    },
    update(dt) {
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt * 1.1;
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        velocities[i * 3 + 1] -= dt * 0.8;
        if (life[i] <= 0) positions[i * 3 + 1] = -999;
      }
      geometry.attributes.position.needsUpdate = true;
    }
  };
}
