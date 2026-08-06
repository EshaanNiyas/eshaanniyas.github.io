import * as THREE from 'three';

/**
 * Interactive hero: a field of instanced cubes that forms a soft grid landscape,
 * ripples away from the pointer and reacts to scroll. Falls back silently when
 * WebGL is unavailable or the visitor prefers reduced motion.
 */
export function initHero(canvas) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060a, 0.028);

  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, 9, 26);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x8ea2ff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(8, 18, 12);
  scene.add(key);
  const rim = new THREE.PointLight(0x7c5cff, 120, 60);
  rim.position.set(-14, 8, -8);
  scene.add(rim);
  const warm = new THREE.PointLight(0xff8e53, 90, 55);
  warm.position.set(16, 6, 6);
  scene.add(warm);

  // ---- instanced field ----
  const COLS = innerWidth < 640 ? 22 : 34;
  const ROWS = innerWidth < 640 ? 22 : 30;
  const SPACING = 1.5;
  const COUNT = COLS * ROWS;

  const geometry = new THREE.BoxGeometry(0.72, 0.72, 0.72);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.55 });
  const field = new THREE.InstancedMesh(geometry, material, COUNT);
  field.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const colorA = new THREE.Color('#6366f1');
  const colorB = new THREE.Color('#22d3ee');
  const colorC = new THREE.Color('#f97316');

  const basePositions = new Float32Array(COUNT * 2);
  const seeds = new Float32Array(COUNT);
  const color = new THREE.Color();

  let i = 0;
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const x = (col - (COLS - 1) / 2) * SPACING;
      const z = (row - (ROWS - 1) / 2) * SPACING;
      basePositions[i * 2] = x;
      basePositions[i * 2 + 1] = z;
      seeds[i] = Math.random() * Math.PI * 2;

      const radial = Math.min(1, Math.hypot(x, z) / (COLS * SPACING * 0.5));
      color.copy(colorA).lerp(colorB, radial).lerp(colorC, Math.max(0, 0.35 - radial) * 0.9);
      field.setColorAt(i, color);
      i++;
    }
  }
  scene.add(field);

  // ---- interaction state ----
  const pointer = new THREE.Vector2(0, 0);      // normalised -1..1
  const pointerWorld = new THREE.Vector3();
  const smoothPointer = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let scrollProgress = 0;
  let burst = 0;

  function onPointerMove(event) {
    pointer.x = (event.clientX / innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / innerHeight) * 2 + 1;
  }
  addEventListener('pointermove', onPointerMove, { passive: true });
  addEventListener('pointerdown', () => { burst = 1; }, { passive: true });

  addEventListener('scroll', () => {
    scrollProgress = Math.min(1, scrollY / Math.max(1, innerHeight));
  }, { passive: true });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ---- loop ----
  const dummy = new THREE.Object3D();
  const clock = new THREE.Clock();
  let running = true;

  // pause the loop when the hero is off screen — keeps scrolling cheap
  const hero = canvas.parentElement;
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => { running = entries[0].isIntersecting; }, { threshold: 0 }).observe(hero);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!running) return;

    const dt = Math.min(clock.getDelta(), 1 / 30);
    const t = reduceMotion ? 0 : clock.elapsedTime;

    smoothPointer.lerp(pointer, Math.min(1, dt * 4));
    raycaster.setFromCamera(smoothPointer, camera);
    raycaster.ray.intersectPlane(groundPlane, pointerWorld);
    burst = Math.max(0, burst - dt * 1.4);

    for (let n = 0; n < COUNT; n++) {
      const x = basePositions[n * 2];
      const z = basePositions[n * 2 + 1];

      const wave = Math.sin(x * 0.32 + t * 0.8) * Math.cos(z * 0.3 - t * 0.6) * 0.9;
      const shimmer = Math.sin(t * 1.6 + seeds[n]) * 0.18;

      const dist = Math.hypot(x - pointerWorld.x, z - pointerWorld.z);
      const influence = Math.exp(-dist * dist / 26);
      const ripple = influence * (2.6 + burst * 5.5) * Math.cos(dist * 0.55 - t * 3.2);

      dummy.position.set(x, wave + shimmer + ripple, z);
      const scale = 1 + influence * (0.7 + burst) - scrollProgress * 0.35;
      dummy.scale.setScalar(Math.max(0.05, scale));
      dummy.rotation.set(wave * 0.25, t * 0.12 + seeds[n] * 0.05 + influence * 1.4, ripple * 0.2);
      dummy.updateMatrix();
      field.setMatrixAt(n, dummy.matrix);
    }
    field.instanceMatrix.needsUpdate = true;

    // camera drifts with the pointer and pulls back as the visitor scrolls away
    camera.position.x += (smoothPointer.x * 3.2 - camera.position.x) * Math.min(1, dt * 1.6);
    camera.position.y += ((9 + smoothPointer.y * 1.6 + scrollProgress * 10) - camera.position.y) * Math.min(1, dt * 1.6);
    camera.position.z = 26 + scrollProgress * 8;
    camera.lookAt(0, -scrollProgress * 3, 0);

    renderer.render(scene, camera);
  }

  frame();
}
