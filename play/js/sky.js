// Atmosphere: a dusk gradient dome, stars, drifting cloud plates and the
// key/fill lighting rig the whole valley is lit by.
import * as THREE from 'three';

export function buildSky({ scene, quality }) {
  const uniforms = {
    top: { value: new THREE.Color(0x0a1030) },
    middle: { value: new THREE.Color(0x2a3a6b) },
    bottom: { value: new THREE.Color(0xd9744a) },
    horizon: { value: 0.06 }
  };

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 middle; uniform vec3 bottom; uniform float horizon;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y;
          vec3 color = mix(bottom, middle, smoothstep(-0.05, 0.35, h));
          color = mix(color, top, smoothstep(0.25, 0.9, h));
          // warm glow hugging the horizon
          color += bottom * horizon * (1.0 - smoothstep(0.0, 0.28, abs(h)));
          gl_FragColor = vec4(color, 1.0);
        }`
    })
  );
  dome.frustumCulled = false;
  scene.add(dome);

  scene.fog = new THREE.FogExp2(0x2b3552, 0.0022);

  /* --------------------------------------------------------------- stars */
  const starCount = quality.tier === 'high' ? 1400 : 600;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(700);
    v.y = Math.abs(v.y) * 0.9 + 40;
    starPos.set([v.x, v.y, v.z], i * 3);
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: 0xcfe0ff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.75 })
  );
  stars.frustumCulled = false;
  scene.add(stars);

  /* -------------------------------------------------------------- clouds */
  const clouds = new THREE.Group();
  if (quality.tier === 'high') {
    const texture = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d');
      for (let i = 0; i < 40; i++) {
        const g = ctx.createRadialGradient(
          Math.random() * 128, Math.random() * 128, 0,
          Math.random() * 128, Math.random() * 128, 30 + Math.random() * 30
        );
        g.addColorStop(0, 'rgba(255,235,215,0.25)');
        g.addColorStop(1, 'rgba(255,235,215,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
      }
      return new THREE.CanvasTexture(canvas);
    })();
    for (let i = 0; i < 14; i++) {
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(160 + Math.random() * 200, 60 + Math.random() * 60),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.5, depthWrite: false })
      );
      plate.position.set((Math.random() - 0.5) * 900, 120 + Math.random() * 90, (Math.random() - 0.5) * 900);
      plate.rotation.x = -0.25;
      plate.lookAt(0, plate.position.y, 0);
      clouds.add(plate);
    }
    scene.add(clouds);
  }

  /* ------------------------------------------------------------ lighting */
  const sun = new THREE.DirectionalLight(0xffd2a8, 3.2);
  sun.position.set(-160, 120, -90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.05;
  const span = 150;
  sun.shadow.camera.left = -span;
  sun.shadow.camera.right = span;
  sun.shadow.camera.top = span;
  sun.shadow.camera.bottom = -span;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 520;
  scene.add(sun, sun.target);

  const bounce = new THREE.DirectionalLight(0x5f7cff, 0.9);
  bounce.position.set(120, 60, 140);
  scene.add(bounce);

  scene.add(new THREE.HemisphereLight(0x9fb6ff, 0x34351f, 1.15));
  scene.add(new THREE.AmbientLight(0x9fb0ff, 0.3));

  const updaters = [(t, dt) => {
    clouds.children.forEach((plate, i) => {
      plate.position.x += dt * (1.6 + i * 0.12);
      if (plate.position.x > 520) plate.position.x = -520;
    });
    stars.rotation.y = t * 0.005;
  }];

  return { sun, updaters };
}
