// Everything that dresses the valley: trees, rocks, grass tufts, roadside
// lamps and floating tech motes. All instanced, all kept off the tarmac.
import * as THREE from 'three';
import { heightAt, nearestRoad, HALF, ROAD_WIDTH, LAKES, waterLevelAt } from './terrain.js';
import { PLACES } from './data.js';

// deterministic PRNG so the world looks the same on every visit
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tooClose(x, z, minRoad) {
  if (nearestRoad(x, z).dist < minRoad) return true;
  // nothing grows in the lakes
  for (const lake of LAKES) {
    if (heightAt(x, z) < waterLevelAt(lake) + 0.4 &&
        Math.hypot((x - lake.x) / lake.rx, (z - lake.z) / lake.rz) < 1.35) return true;
  }
  for (const place of PLACES) {
    const [px, pz] = place.position;
    if (Math.hypot(x - px, z - pz) < place.radius + 6) return true;
  }
  return false;
}

export function buildScatter({ scene, quality }) {
  const random = rng(20260805);
  const dummy = new THREE.Object3D();
  const updaters = [];
  const dense = quality.tier === 'high';

  /* --------------------------------------------------------------- trees */
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.4, 3.4, 6);
  trunkGeo.translate(0, 1.7, 0);
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);
  leafGeo.scale(1.5, 1.9, 1.5);
  leafGeo.translate(0, 4.4, 0);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2c5637, roughness: 0.9, flatShading: true });

  const TREES = dense ? 560 : 220;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, TREES);
  const leafColor = new THREE.Color();
  let placed = 0;
  for (let guard = 0; guard < TREES * 12 && placed < TREES; guard++) {
    const x = (random() * 2 - 1) * (HALF - 20);
    const z = (random() * 2 - 1) * (HALF - 20);
    if (tooClose(x, z, ROAD_WIDTH * 0.5 + 5)) continue;
    const y = heightAt(x, z);
    if (y > 30) continue;   // treeline
    const scale = 0.75 + random() * 0.9;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.08);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    leaves.setMatrixAt(placed, dummy.matrix);
    leafColor.setHSL(0.29 + random() * 0.06, 0.32 + random() * 0.15, 0.2 + random() * 0.1);
    leaves.setColorAt(placed, leafColor);
    placed++;
  }
  trunks.count = leaves.count = placed;
  trunks.castShadow = leaves.castShadow = true;
  leaves.receiveShadow = true;
  scene.add(trunks, leaves);

  /* --------------------------------------------------------------- rocks */
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b6068, roughness: 0.9, metalness: 0.05, flatShading: true });
  const ROCKS = dense ? 240 : 110;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  placed = 0;
  for (let guard = 0; guard < ROCKS * 10 && placed < ROCKS; guard++) {
    const x = (random() * 2 - 1) * (HALF - 10);
    const z = (random() * 2 - 1) * (HALF - 10);
    if (tooClose(x, z, ROAD_WIDTH * 0.5 + 3)) continue;
    const y = heightAt(x, z);
    dummy.position.set(x, y + 0.2, z);
    dummy.rotation.set(random() * 3, random() * 3, random() * 3);
    dummy.scale.set(0.6 + random() * 2.4, 0.5 + random() * 1.6, 0.6 + random() * 2.4);
    dummy.updateMatrix();
    rocks.setMatrixAt(placed++, dummy.matrix);
  }
  rocks.count = placed;
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);

  /* ---------------------------------------------------------- grass tufts */
  if (dense) {
    const bladeGeo = new THREE.ConeGeometry(0.16, 0.9, 3);
    bladeGeo.translate(0, 0.45, 0);
    const grass = new THREE.InstancedMesh(
      bladeGeo,
      new THREE.MeshStandardMaterial({ color: 0x466b41, roughness: 1, flatShading: true }),
      1600
    );
    placed = 0;
    for (let guard = 0; guard < 9000 && placed < 1600; guard++) {
      const x = (random() * 2 - 1) * (HALF - 10);
      const z = (random() * 2 - 1) * (HALF - 10);
      if (nearestRoad(x, z).dist < ROAD_WIDTH * 0.5 + 1.5) continue;
      dummy.position.set(x, heightAt(x, z), z);
      dummy.rotation.set(0, random() * 3, (random() - 0.5) * 0.4);
      dummy.scale.setScalar(0.7 + random() * 1.1);
      dummy.updateMatrix();
      grass.setMatrixAt(placed++, dummy.matrix);
    }
    grass.count = placed;
    scene.add(grass);
  }

  /* -------------------------------------------------------- roadside lamps */
  const lampPosts = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  postGeo.translate(0, 3, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x262b36, roughness: 0.6, metalness: 0.5 });
  const bulbGeo = new THREE.SphereGeometry(0.28, 10, 8);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffd98a, emissiveIntensity: 3 });
  const LAMPS = dense ? 90 : 44;
  const posts = new THREE.InstancedMesh(postGeo, postMat, LAMPS);
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, LAMPS);
  placed = 0;
  for (let guard = 0; guard < LAMPS * 40 && placed < LAMPS; guard++) {
    const x = (random() * 2 - 1) * (HALF - 20);
    const z = (random() * 2 - 1) * (HALF - 20);
    const road = nearestRoad(x, z);
    if (road.dist < ROAD_WIDTH * 0.5 + 1.4 || road.dist > ROAD_WIDTH * 0.5 + 2.6) continue;
    const y = heightAt(x, z);
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    posts.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = y + 6;
    dummy.updateMatrix();
    bulbs.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  posts.count = bulbs.count = placed;
  posts.castShadow = true;
  lampPosts.add(posts, bulbs);
  scene.add(lampPosts);

  /* ----------------------------------------------------------- tech motes */
  // slowly drifting shapes: the "building things" motif, visible from anywhere
  const moteGeo = new THREE.OctahedronGeometry(0.9, 0);
  const moteMat = new THREE.MeshStandardMaterial({
    color: 0x9fd8ff, emissive: 0x2f6dff, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.6,
    transparent: true, opacity: 0.85
  });
  const MOTES = dense ? 90 : 40;
  const motes = new THREE.InstancedMesh(moteGeo, moteMat, MOTES);
  const seeds = [];
  for (let i = 0; i < MOTES; i++) {
    const x = (random() * 2 - 1) * 190;
    const z = (random() * 2 - 1) * 190;
    seeds.push({ x, z, base: heightAt(x, z) + 10 + random() * 26, phase: random() * 9, spin: 0.2 + random() * 0.5, scale: 0.5 + random() * 1.3 });
  }
  scene.add(motes);
  updaters.push((t) => {
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      dummy.position.set(s.x, s.base + Math.sin(t * 0.5 + s.phase) * 2.4, s.z);
      dummy.rotation.set(t * s.spin, t * s.spin * 1.3, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      motes.setMatrixAt(i, dummy.matrix);
    }
    motes.instanceMatrix.needsUpdate = true;
  });

  return { updaters };
}
