import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { buildWorld } from './world.js';
import { createVehicle } from './vehicle.js';
import { MILESTONES } from './data.js';

const ui = {
  loader: document.getElementById('loader'),
  hud: document.getElementById('hud'),
  panel: document.getElementById('panel'),
  toast: document.getElementById('toast'),
  speed: document.getElementById('speed'),
  found: document.getElementById('found'),
  total: document.getElementById('total'),
  progress: document.getElementById('progress-bar')
};

/* --------------------------------------------------------------- quality */
const isCoarse = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Software rasterisers (SwiftShader, llvmpipe) cannot afford bloom or big shadow maps.
const softwareGL = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch (err) { return false; }
})();

const lowPower = softwareGL || isCoarse || innerWidth < 720 || (navigator.hardwareConcurrency || 4) <= 4;
const quality = lowPower
  ? { tier: 'low', shadowMap: 1024, bloom: false, pixelRatio: softwareGL ? 0.6 : 1 }
  : { tier: 'high', shadowMap: 2048, bloom: true, pixelRatio: Math.min(devicePixelRatio, 1.75) };
if (softwareGL) quality.shadowMap = 512;

if (isCoarse) document.body.classList.add('touch');

/* ---------------------------------------------------------------- render */
const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, powerPreference: 'high-performance' });
renderer.setPixelRatio(quality.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.4, 600);
camera.position.set(0, 60, 120);

// image-based lighting gives the metals something to reflect
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

let composer = null;
if (quality.bloom) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.7, 0.85));
  composer.addPass(new OutputPass());
}

/* --------------------------------------------------------------- physics */
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.defaultContactMaterial.friction = 0.5;

const groundMaterial = new CANNON.Material('ground');
world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, groundMaterial, {
  friction: 0.4, restitution: 0
}));

/* ----------------------------------------------------------------- build */
const { updaters, interactives, boostPads, knockables } = buildWorld({ scene, world, groundMaterial, quality });
const { vehicle, chassisBody, car, wheelMeshes, reset, underglow } = createVehicle({ scene, world, groundMaterial });

ui.total.textContent = String(MILESTONES.length);

/* --------------------------------------------------------------- controls */
const keys = { forward: false, back: false, left: false, right: false, brake: false };
const KEY_MAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'brake'
};
addEventListener('keydown', event => {
  if (event.code === 'KeyR') { reset(); return; }
  if (event.code === 'KeyC') { cinematic = !cinematic; toast(cinematic ? 'Cinematic camera' : 'Chase camera'); return; }
  const key = KEY_MAP[event.code];
  if (key) { keys[key] = true; event.preventDefault(); }
});
addEventListener('keyup', event => {
  const key = KEY_MAP[event.code];
  if (key) { keys[key] = false; event.preventDefault(); }
});

document.querySelectorAll('#touch button').forEach(button => {
  const key = button.dataset.key;
  const press = event => { event.preventDefault(); keys[key] = true; };
  const release = event => { event.preventDefault(); keys[key] = false; };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointerleave', release);
  button.addEventListener('pointercancel', release);
});

/* ------------------------------------------------------------ interaction */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);
const interactiveObjects = interactives.map(item => item.object);
const discovered = new Set();
let hovered = null;
let activeId = null;

addEventListener('pointermove', event => {
  pointer.set((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
}, { passive: true });

renderer.domElement.addEventListener('click', () => {
  if (hovered) showPanel(hovered);
});

function showPanel(item) {
  if (activeId === item.id) return;
  activeId = item.id;
  ui.panel.innerHTML = `
    <span class="panel-meta">${item.meta}</span>
    <h3>${item.title}</h3>
    ${item.body ? `<p>${item.body}</p>` : ''}`;
  ui.panel.classList.add('visible');

  if (item.kind === 'milestone' && !discovered.has(item.id)) {
    discovered.add(item.id);
    ui.found.textContent = String(discovered.size);
    ui.progress.style.width = `${(discovered.size / MILESTONES.length) * 100}%`;
    if (discovered.size === MILESTONES.length) toast('Every milestone found. Nicely driven.');
  }
}

function hidePanel() {
  if (!activeId) return;
  activeId = null;
  ui.panel.classList.remove('visible');
}

let toastTimer = 0;
function toast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 2600);
}

/* -------------------------------------------------------------- particles */
const SPARK_COUNT = 220;
const sparkGeo = new THREE.BufferGeometry();
const sparkPositions = new Float32Array(SPARK_COUNT * 3);
const sparkVelocities = new Float32Array(SPARK_COUNT * 3);
const sparkLife = new Float32Array(SPARK_COUNT);
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
  color: 0x9fe8ff, size: 0.42, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending
}));
scene.add(sparks);
let sparkCursor = 0;

function emitSparks(origin, count, spread = 7) {
  for (let i = 0; i < count; i++) {
    const n = sparkCursor = (sparkCursor + 1) % SPARK_COUNT;
    sparkPositions[n * 3] = origin.x;
    sparkPositions[n * 3 + 1] = origin.y + 0.4;
    sparkPositions[n * 3 + 2] = origin.z;
    sparkVelocities[n * 3] = (Math.random() - 0.5) * spread;
    sparkVelocities[n * 3 + 1] = Math.random() * spread * 0.9;
    sparkVelocities[n * 3 + 2] = (Math.random() - 0.5) * spread;
    sparkLife[n] = 1;
  }
}

/* ------------------------------------------------------------- car motion */
const MAX_FORCE = 900;
const MAX_SPEED = 26;
const MAX_STEER = 0.48;
let steer = 0;
let boost = 0;
let cinematic = false;

function applyControls(dt) {
  const speed = chassisBody.velocity.length();
  // steering tightens as speed rises, the way a real car feels
  const limit = MAX_STEER * (1 - Math.min(0.55, speed / 46));
  const target = (keys.left ? -limit : 0) + (keys.right ? limit : 0);
  steer += (target - steer) * Math.min(1, dt * 9);
  vehicle.setSteeringValue(steer, 0);
  vehicle.setSteeringValue(steer, 1);

  const ceiling = MAX_SPEED + boost * 16;
  const force = speed > ceiling ? 0
    : keys.forward ? MAX_FORCE * (1 + boost * 0.9)
    : keys.back ? -MAX_FORCE * 0.55
    : 0;
  for (let i = 0; i < 4; i++) vehicle.applyEngineForce(force, i);

  const coasting = !keys.forward && !keys.back;
  const brake = keys.brake ? 46 : coasting ? 7 : 0;
  for (let i = 0; i < 4; i++) vehicle.setBrake(brake, i);
}

/* ---------------------------------------------------------------- camera */
const camPos = new THREE.Vector3(0, 60, 120);
const camLook = new THREE.Vector3();
const desired = new THREE.Vector3();
const chaseOffset = new THREE.Vector3(0, 6.4, 13.5);
const cineOffset = new THREE.Vector3(7.5, 3.2, 9);
let intro = 1;

function updateCamera(dt, speed) {
  const offset = (cinematic ? cineOffset : chaseOffset).clone();
  desired.copy(offset).applyQuaternion(car.quaternion).add(car.position);
  desired.y = Math.max(desired.y, car.position.y + 2.6);

  if (intro > 0) {
    // cinematic fly-in on load
    intro = Math.max(0, intro - dt * 0.5);
    const eased = intro * intro;
    desired.x += Math.sin(intro * 6) * 40 * eased;
    desired.y += 70 * eased;
    desired.z += 60 * eased;
  }

  camPos.lerp(desired, Math.min(1, dt * (cinematic ? 2.1 : 3.4)));
  camera.position.copy(camPos);

  camLook.lerp(car.position, Math.min(1, dt * 6));
  camera.lookAt(camLook.x, camLook.y + 2.2, camLook.z);

  const targetFov = 58 + Math.min(16, speed * 0.42) + boost * 9;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();

function syncMesh(mesh, body) {
  mesh.position.copy(body.position);
  mesh.quaternion.copy(body.quaternion);
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const t = clock.elapsedTime;

  applyControls(dt);
  world.step(1 / 60, dt, 3);

  syncMesh(car, chassisBody);
  for (let i = 0; i < wheelMeshes.length; i++) {
    vehicle.updateWheelTransform(i);
    syncMesh(wheelMeshes[i], vehicle.wheelInfos[i].worldTransform);
  }
  for (const item of knockables) syncMesh(item.mesh, item.body);
  if (chassisBody.position.y < -10) reset();

  const speed = chassisBody.velocity.length();
  ui.speed.textContent = String(Math.round(speed * 3.6));
  underglow.intensity = 10 + Math.min(24, speed * 1.1);

  if (!reduceMotion) for (const update of updaters) update(t, dt);

  /* boost pads */
  boost = Math.max(0, boost - dt * 0.7);
  for (const pad of boostPads) {
    if (car.position.distanceTo(pad.position) < pad.radius && boost < 0.3) {
      boost = 1;
      emitSparks(car.position, 40, 9);
      toast('Boost!');
    }
  }

  /* proximity + hover interaction */
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(interactiveObjects, false);
  const hitItem = hits.length ? interactives.find(item => item.object === hits[0].object) : null;

  if (hitItem !== hovered) {
    if (hovered?.shard) hovered.shard.scale.setScalar(1);
    hovered = hitItem;
    document.body.style.cursor = hovered ? 'pointer' : '';
  }
  if (hovered?.shard) hovered.shard.scale.setScalar(1.35);

  let nearest = null;
  for (const item of interactives) {
    const distance = tmp.copy(car.position).sub(item.position).setY(0).length();
    const inside = distance < item.radius;
    if (inside && (!nearest || distance < nearest.distance)) nearest = { item, distance };
    if (item.highlight) {
      item.highlight.scale.lerp(
        tmp.set(inside ? 1.14 : 1, inside ? 1.14 : 1, 1),
        Math.min(1, dt * 6)
      );
    }
  }
  if (nearest) {
    if (nearest.item.id !== activeId && nearest.item.kind === 'milestone') {
      emitSparks(nearest.item.position, 16, 5);
    }
    showPanel(nearest.item);
  } else if (!hovered) {
    hidePanel();
  }

  /* sparks */
  for (let i = 0; i < SPARK_COUNT; i++) {
    if (sparkLife[i] <= 0) continue;
    sparkLife[i] -= dt * 0.9;
    sparkVelocities[i * 3 + 1] -= dt * 12;
    sparkPositions[i * 3] += sparkVelocities[i * 3] * dt;
    sparkPositions[i * 3 + 1] += sparkVelocities[i * 3 + 1] * dt;
    sparkPositions[i * 3 + 2] += sparkVelocities[i * 3 + 2] * dt;
    if (sparkPositions[i * 3 + 1] < 0.1) sparkLife[i] = 0;
  }
  sparkGeo.attributes.position.needsUpdate = true;

  updateCamera(dt, speed);

  if (composer) composer.render();
  else renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});

window.__play = { car, chassisBody, vehicle, camera, scene, keys, renderer };

frame();

requestAnimationFrame(() => {
  ui.loader.classList.add('hidden');
  ui.hud.classList.add('visible');
  setTimeout(() => ui.loader.remove(), 900);
  setTimeout(() => toast('Drive into a monument to read it'), 2200);
});
