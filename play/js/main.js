import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { buildTerrain, heightAt, ROADS, HALF } from './terrain.js';
import { buildSky } from './sky.js';
import { buildScatter } from './scatter.js';
import { buildPlaces } from './places.js';
import { loadCarModel, createCar, createSkidMarks, createDust, RIDE_HEIGHT } from './car.js';
import { createAudio } from './audio.js';


const ui = {
  loader: document.getElementById('loader'),
  loaderBar: document.getElementById('loader-bar'),
  loaderStatus: document.getElementById('loader-status'),
  enter: document.getElementById('enter'),
  hud: document.getElementById('hud'),
  panel: document.getElementById('panel'),
  toast: document.getElementById('toast'),
  speed: document.getElementById('speed'),
  found: document.getElementById('found'),
  total: document.getElementById('total'),
  progress: document.getElementById('progress-bar'),
  sound: document.getElementById('sound'),
  minimap: document.querySelector('#minimap canvas')
};

/* --------------------------------------------------------------- quality */
const isCoarse = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  ? { tier: 'low', shadowMap: softwareGL ? 512 : 1024, bloom: false, pixelRatio: softwareGL ? 0.55 : 1 }
  : { tier: 'high', shadowMap: 2048, bloom: true, pixelRatio: Math.min(devicePixelRatio, 1.7) };

if (isCoarse) document.body.classList.add('touch');

/* ---------------------------------------------------------------- render */
const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, powerPreference: 'high-performance' });
renderer.setPixelRatio(quality.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 1400);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

let composer = null;
if (quality.bloom) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.8, 0.9));
  composer.addPass(new OutputPass());
}

/* --------------------------------------------------------------- physics */
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.defaultContactMaterial.friction = 0.45;

const groundMaterial = new CANNON.Material('ground');
world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, groundMaterial, {
  friction: 0.5, restitution: 0
}));

/* ------------------------------------------------------------------ boot */
const progress = { model: 0, world: 0 };
function setProgress(status) {
  if (status) ui.loaderStatus.textContent = status;
  ui.loaderBar.style.width = `${Math.round((progress.model * 0.6 + progress.world * 0.4) * 100)}%`;
}

const audio = createAudio();
const spawn = new CANNON.Vec3(6, heightAt(6, 34) + RIDE_HEIGHT + 0.4, 34);

let carApi = null;
let places = [];
let updaters = [];
let skid = null;
let dust = null;
let started = false;

async function boot() {
  setProgress('Loading the car');
  const model = await loadCarModel(event => {
    if (event.total) progress.model = event.loaded / event.total;
    setProgress();
  });
  progress.model = 1;
  setProgress('Raising the terrain');
  await frameBreak();

  buildTerrain({ scene, world, groundMaterial, quality });
  progress.world = 0.35;
  setProgress('Lighting the sky');
  await frameBreak();

  const sky = buildSky({ scene, quality });
  progress.world = 0.5;
  setProgress('Planting the valley');
  await frameBreak();

  const scatter = buildScatter({ scene, quality });
  progress.world = 0.75;
  setProgress('Building the places');
  await frameBreak();

  const built = buildPlaces({ scene, world });
  places = built.places;
  updaters = [...sky.updaters, ...scatter.updaters, ...built.updaters];
  progress.world = 0.92;
  setProgress('Warming up');
  await frameBreak();

  carApi = createCar({ scene, world, groundMaterial, model, quality, spawn });
  skid = createSkidMarks(scene);
  dust = createDust(scene);
  sunTarget = sky.sun;

  ui.total.textContent = String(places.length);
  progress.world = 1;
  setProgress('Ready');

  // one full render so nothing compiles during the first frames of driving
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  ui.enter.classList.add('ready');
  frame();
}

const frameBreak = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

let sunTarget = null;

ui.enter.addEventListener('click', () => {
  if (started) return;
  started = true;
  ui.loader.classList.add('hidden');
  ui.hud.classList.add('visible');
  setTimeout(() => ui.loader.remove(), 900);
  setTimeout(() => toast('Follow a road — each one leads somewhere'), 2400);
});

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
  if (event.code === 'KeyR') { respawn(); return; }
  if (event.code === 'KeyC') { cinematic = !cinematic; toast(cinematic ? 'Cinematic camera' : 'Chase camera'); return; }
  if (event.code === 'KeyM') { toggleSound(); return; }
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

function toggleSound() {
  const on = audio.toggle();
  ui.sound.textContent = on ? 'Sound on' : 'Sound off';
}
ui.sound.addEventListener('click', toggleSound);

/* ------------------------------------------------------------- discovery */
const discovered = new Set();
let activeId = null;
let toastTimer = 0;

function toast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 2800);
}

function showPanel(place) {
  if (activeId === place.id) return;
  activeId = place.id;
  ui.panel.innerHTML = `
    <span class="panel-meta">${place.meta}</span>
    <h3>${place.name}</h3>
    <p>${place.blurb}</p>
    ${place.items.length ? `<ul>${place.items.map(item =>
      `<li><strong>${item.title}</strong><span>${item.meta}</span></li>`).join('')}</ul>` : ''}`;
  ui.panel.classList.add('visible');

  if (!discovered.has(place.id)) {
    discovered.add(place.id);
    ui.found.textContent = String(discovered.size);
    ui.progress.style.width = `${(discovered.size / places.length) * 100}%`;
    audio.chime(discovered.size * 2);
    if (discovered.size === places.length) toast('Every place found. Thanks for exploring.');
  }
}

function hidePanel() {
  if (!activeId) return;
  activeId = null;
  ui.panel.classList.remove('visible');
}

/* --------------------------------------------------------------- driving */
const ENGINE_FORCE = 2600;
const REVERSE_FORCE = 1300;
const MAX_SPEED = 42;
const MAX_STEER = 0.5;
let steer = 0;
let cinematic = false;
let shake = 0;

function applyControls(dt) {
  const { vehicle, chassisBody } = carApi;
  const speed = chassisBody.velocity.length();

  // steering tightens with speed so the car stays composed at pace
  const limit = MAX_STEER * (1 - Math.min(0.62, speed / 52));
  const target = (keys.left ? limit : 0) + (keys.right ? -limit : 0);
  steer += (target - steer) * Math.min(1, dt * 8);
  vehicle.setSteeringValue(steer, 0);
  vehicle.setSteeringValue(steer, 1);

  // torque falls off towards top speed instead of clipping to zero
  const falloff = Math.max(0, 1 - speed / MAX_SPEED);
  const force = keys.forward ? ENGINE_FORCE * (0.35 + falloff)
    : keys.back ? -REVERSE_FORCE
    : 0;
  vehicle.applyEngineForce(force * 0.35, 0);
  vehicle.applyEngineForce(force * 0.35, 1);
  vehicle.applyEngineForce(force, 2);
  vehicle.applyEngineForce(force, 3);

  const coasting = !keys.forward && !keys.back;
  vehicle.setBrake(keys.brake ? 30 : coasting ? 6 : 0, 0);
  vehicle.setBrake(keys.brake ? 30 : coasting ? 6 : 0, 1);
  // handbrake locks the rears: that is where the slides come from
  vehicle.setBrake(keys.brake ? 130 : coasting ? 6 : 0, 2);
  vehicle.setBrake(keys.brake ? 130 : coasting ? 6 : 0, 3);

  carApi.setBraking(keys.brake, keys.back);
  return speed;
}

function respawn() {
  const heading = Math.atan2(-carApi.chassisBody.position.x, -carApi.chassisBody.position.z);
  const x = carApi.chassisBody.position.x;
  const z = carApi.chassisBody.position.z;
  const inside = Math.abs(x) < HALF - 20 && Math.abs(z) < HALF - 20;
  const target = inside
    ? new THREE.Vector3(x, heightAt(x, z) + RIDE_HEIGHT + 0.5, z)
    : new THREE.Vector3(spawn.x, spawn.y, spawn.z);
  carApi.reset(target, inside ? heading : 0);
  skid.clear();
}

/* -------------------------------------------------------- stuck recovery */
let stuck = 0;
const upAxis = new THREE.Vector3();

function unstick(dt) {
  const { chassisBody, car } = carApi;
  const ground = heightAt(chassisBody.position.x, chassisBody.position.z);
  const sunk = chassisBody.position.y < ground + RIDE_HEIGHT - 0.22;
  const tipped = upAxis.set(0, 1, 0).applyQuaternion(car.quaternion).y < 0.55;
  const stalled = chassisBody.velocity.length() < 0.7;
  const trying = keys.forward || keys.back;

  stuck = (sunk || tipped) && stalled ? stuck + dt : 0;
  if (stuck < (trying ? 0.9 : 2.6)) return;
  stuck = 0;

  const heading = Math.atan2(
    2 * (chassisBody.quaternion.w * chassisBody.quaternion.y + chassisBody.quaternion.x * chassisBody.quaternion.z),
    1 - 2 * (chassisBody.quaternion.y ** 2 + chassisBody.quaternion.z ** 2)
  );
  carApi.reset(
    new THREE.Vector3(chassisBody.position.x, ground + RIDE_HEIGHT + 0.5, chassisBody.position.z),
    heading
  );
}

/* ---------------------------------------------------------------- camera */
const camPos = new THREE.Vector3(60, 40, 90);
const camLook = new THREE.Vector3();
const desired = new THREE.Vector3();
const chaseOffset = new THREE.Vector3(0, 3.7, -8.6);
const cineOffset = new THREE.Vector3(4.6, 1.9, -6.2);
let intro = 1;

function updateCamera(dt, speed) {
  const car = carApi.car;
  const offset = (cinematic ? cineOffset : chaseOffset).clone();
  desired.copy(offset).applyQuaternion(car.quaternion).add(car.position);

  // never let the camera sink into a hill
  const floor = heightAt(desired.x, desired.z) + 1.8;
  desired.y = Math.max(desired.y, floor, car.position.y + 1.4);

  if (intro > 0 && started) {
    intro = Math.max(0, intro - dt * 0.42);
    const eased = intro * intro;
    desired.x += Math.sin(intro * 5) * 34 * eased;
    desired.y += 46 * eased;
    desired.z += 34 * eased;
  }

  const follow = Math.min(1, dt * (cinematic ? 1.8 : 3.2 + speed * 0.05));
  camPos.lerp(desired, follow);
  camera.position.copy(camPos);

  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake *= 0.86;
  }

  camLook.lerp(car.position, Math.min(1, dt * 5));
  camera.lookAt(camLook.x, camLook.y + 1.7, camLook.z);

  const targetFov = 60 + Math.min(18, speed * 0.5);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 2.5);
  camera.updateProjectionMatrix();
}

/* --------------------------------------------------------------- minimap */
const mapCtx = ui.minimap.getContext('2d');
const MAP_SIZE = ui.minimap.width;
const toMap = v => (v / (HALF * 2) + 0.5) * MAP_SIZE;

function drawMinimap() {
  mapCtx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
  mapCtx.fillStyle = 'rgba(10,14,26,0.65)';
  mapCtx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

  mapCtx.strokeStyle = 'rgba(180,200,240,0.35)';
  mapCtx.lineWidth = 3;
  for (const path of ROADS) {
    mapCtx.beginPath();
    path.forEach(([x, z], i) => {
      const px = toMap(x);
      const pz = toMap(z);
      if (i === 0) mapCtx.moveTo(px, pz); else mapCtx.lineTo(px, pz);
    });
    mapCtx.stroke();
  }

  for (const place of places) {
    const [x, z] = place.position;
    mapCtx.beginPath();
    mapCtx.fillStyle = discovered.has(place.id)
      ? `#${place.color.toString(16).padStart(6, '0')}`
      : 'rgba(210,220,245,0.35)';
    mapCtx.arc(toMap(x), toMap(z), discovered.has(place.id) ? 6 : 4, 0, Math.PI * 2);
    mapCtx.fill();
  }

  const car = carApi.car;
  const px = toMap(car.position.x);
  const pz = toMap(car.position.z);
  const heading = Math.atan2(
    2 * (car.quaternion.w * car.quaternion.y + car.quaternion.x * car.quaternion.z),
    1 - 2 * (car.quaternion.y ** 2 + car.quaternion.z ** 2)
  );
  mapCtx.save();
  mapCtx.translate(px, pz);
  mapCtx.rotate(-heading);
  mapCtx.fillStyle = '#ffffff';
  mapCtx.beginPath();
  mapCtx.moveTo(0, -9);
  mapCtx.lineTo(6, 7);
  mapCtx.lineTo(-6, 7);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.restore();
}

/* ------------------------------------------------------------ interaction */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);
let hovered = null;

addEventListener('pointermove', event => {
  pointer.set((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
}, { passive: true });

renderer.domElement.addEventListener('click', () => {
  if (hovered) showPanel(hovered);
});

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
const contactPoint = new THREE.Vector3();
let mapTimer = 0;

function syncMesh(mesh, body) {
  mesh.position.copy(body.position);
  mesh.quaternion.copy(body.quaternion);
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const t = clock.elapsedTime;
  const { vehicle, chassisBody, car, wheels } = carApi;

  const speed = started ? applyControls(dt) : chassisBody.velocity.length();
  world.step(1 / 60, dt, 3);

  syncMesh(car, chassisBody);
  for (let i = 0; i < wheels.length; i++) {
    vehicle.updateWheelTransform(i);
    syncMesh(wheels[i], vehicle.wheelInfos[i].worldTransform);
  }

  if (chassisBody.position.y < -20 || Math.abs(chassisBody.position.x) > HALF || Math.abs(chassisBody.position.z) > HALF) {
    carApi.reset(new THREE.Vector3(spawn.x, spawn.y, spawn.z), 0);
    toast('Back to the start');
  }
  unstick(dt);

  /* ---------------------------------------------------- wheels & surfaces */
  let sliding = 0;
  let offRoad = 0;
  for (let i = 0; i < 4; i++) {
    const info = vehicle.wheelInfos[i];
    if (!info.isInContact) continue;
    const slip = Math.abs(info.sideImpulse || 0) + Math.abs(info.skidInfo < 1 ? (1 - info.skidInfo) * 400 : 0);
    contactPoint.copy(info.raycastResult.hitPointWorld);
    if (i >= 2 && (slip > 900 || (keys.brake && speed > 6))) {
      sliding++;
      if (!reduceMotion) {
        skid.drop(contactPoint, Math.atan2(
          2 * (car.quaternion.w * car.quaternion.y + car.quaternion.x * car.quaternion.z),
          1 - 2 * (car.quaternion.y ** 2 + car.quaternion.z ** 2)
        ));
      }
    }
    if (speed > 4 && !reduceMotion) {
      offRoad++;
      if (Math.random() < (sliding ? 0.9 : 0.25)) {
        dust.emit(contactPoint.x, contactPoint.y, contactPoint.z, 1.2 + speed * 0.06);
      }
    }
  }
  dust.update(dt);
  if (sliding) shake = Math.min(0.16, shake + dt * 0.9);
  shake = Math.max(shake, Math.min(0.1, speed * 0.0016));

  /* ------------------------------------------------------------- displays */
  ui.speed.textContent = String(Math.round(speed * 3.6));
  audio.update(speed, keys.forward ? 1 : keys.back ? 0.5 : 0);

  if (!reduceMotion) for (const update of updaters) update(t, dt);

  /* ------------------------------------------------------------ discovery */
  let nearest = null;
  for (const place of places) {
    const distance = tmp.copy(car.position).sub(place.world).setY(0).length();
    if (distance < place.radius && (!nearest || distance < nearest.distance)) nearest = { place, distance };
    const near = distance < place.radius * 1.6;
    place.halo.material.opacity += ((near ? 0.5 : 0.18) - place.halo.material.opacity) * Math.min(1, dt * 3);
    if (place.board.visible) {
      place.board.material.opacity += ((near ? 1 : 0.5) - place.board.material.opacity) * Math.min(1, dt * 3);
      place.board.lookAt(camera.position);
    }
  }
  if (nearest) showPanel(nearest.place);
  else if (!hovered) hidePanel();

  /* ---------------------------------------------------------- hover/click */
  if (!isCoarse) {
    raycaster.setFromCamera(pointer, camera);
    let found = null;
    for (const place of places) {
      if (raycaster.intersectObject(place.group, true).length) { found = place; break; }
    }
    if (found !== hovered) {
      hovered = found;
      document.body.style.cursor = hovered ? 'pointer' : '';
    }
  }

  /* ----------------------------------------------------------- sun follow */
  if (sunTarget) {
    sunTarget.position.set(car.position.x - 120, car.position.y + 110, car.position.z - 80);
    sunTarget.target.position.copy(car.position);
    sunTarget.target.updateMatrixWorld();
  }

  updateCamera(dt, speed);

  mapTimer += dt;
  if (mapTimer > 0.1) { mapTimer = 0; drawMinimap(); }

  if (composer) composer.render();
  else renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});

boot().then(() => {
  window.__play = {
    get car() { return carApi.car; },
    get chassisBody() { return carApi.chassisBody; },
    get vehicle() { return carApi.vehicle; },
    camera, scene, keys, renderer, places, discovered,
    start() { ui.enter.click(); }
  };
}).catch(error => {
  console.error(error);
  document.body.classList.add('fallback');
  ui.loader.classList.add('hidden');
});
