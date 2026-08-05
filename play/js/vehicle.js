import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const SPAWN = new CANNON.Vec3(0, 2.2, 12);

/** Raycast-vehicle car with a shaped body, lights and wheel meshes. */
export function createVehicle({ scene, world, groundMaterial }) {
  const CHASSIS = { w: 2, h: 0.55, l: 4.1 };

  const chassisBody = new CANNON.Body({ mass: 170, material: groundMaterial });
  chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(CHASSIS.w / 2, CHASSIS.h / 2, CHASSIS.l / 2)));
  chassisBody.position.copy(SPAWN);
  chassisBody.angularDamping = 0.4;
  chassisBody.allowSleep = false;

  const vehicle = new CANNON.RaycastVehicle({
    chassisBody, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2
  });

  const WHEEL_RADIUS = 0.52;
  const wheelOptions = {
    radius: WHEEL_RADIUS,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: 36,
    suspensionRestLength: 0.36,
    frictionSlip: 3.6,
    dampingRelaxation: 2.5,
    dampingCompression: 4.5,
    maxSuspensionForce: 100000,
    rollInfluence: 0.03,
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    maxSuspensionTravel: 0.32,
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true
  };
  for (const [x, z] of [[-1, 1.5], [1, 1.5], [-1, -1.5], [1, -1.5]]) {
    vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(x, -0.08, z) });
  }
  vehicle.addToWorld(world);

  /* -------------------------------------------------------------- visuals */
  const car = new THREE.Group();

  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xef4444, roughness: 0.22, metalness: 0.85, envMapIntensity: 1.6
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x11141f, roughness: 0.35, metalness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0b1020, roughness: 0.05, metalness: 1, envMapIntensity: 2.4
  });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(CHASSIS.w, CHASSIS.h, CHASSIS.l), shellMat);
  hull.castShadow = true;
  car.add(hull);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(CHASSIS.w * 0.94, 0.34, 1.1), shellMat);
  nose.position.set(0, -0.12, -CHASSIS.l / 2 + 0.4);
  nose.castShadow = true;
  car.add(nose);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(CHASSIS.w * 0.78, 0.52, 1.9), glassMat);
  cabin.position.set(0, 0.52, -0.12);
  cabin.castShadow = true;
  car.add(cabin);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(CHASSIS.w * 1.02, 0.1, 0.5), trimMat);
  wing.position.set(0, 0.62, CHASSIS.l / 2 - 0.25);
  car.add(wing);
  for (const sx of [-0.75, 0.75]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.16), trimMat);
    strut.position.set(sx, 0.42, CHASSIS.l / 2 - 0.25);
    car.add(strut);
  }

  // lights
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 3, roughness: 0.2
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x330000, emissive: 0xff2a2a, emissiveIntensity: 2, roughness: 0.3
  });
  for (const sx of [-0.62, 0.62]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.1), headlightMat);
    head.position.set(sx, -0.05, -CHASSIS.l / 2 - 0.02);
    car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.08), tailMat);
    tail.position.set(sx, 0.08, CHASSIS.l / 2 + 0.01);
    car.add(tail);
  }

  const beam = new THREE.SpotLight(0xfff0cf, 90, 46, 0.5, 0.55, 1.4);
  beam.position.set(0, 0.1, -CHASSIS.l / 2);
  beam.target.position.set(0, -0.6, -14);
  car.add(beam, beam.target);

  const underglow = new THREE.PointLight(0x22d3ee, 14, 9);
  underglow.position.set(0, -0.5, 0);
  car.add(underglow);

  scene.add(car);

  const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.38, 22);
  wheelGeo.rotateZ(Math.PI / 2);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x0b0d14, roughness: 0.85, metalness: 0.1 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc9d2e6, roughness: 0.2, metalness: 1 });
  const wheelMeshes = vehicle.wheelInfos.map(() => {
    const group = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, tyreMat);
    tyre.castShadow = true;
    group.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_RADIUS * 0.55, WHEEL_RADIUS * 0.55, 0.4, 12), rimMat);
    rim.rotation.z = Math.PI / 2;
    group.add(rim);
    scene.add(group);
    return group;
  });

  function reset() {
    chassisBody.position.copy(SPAWN);
    chassisBody.velocity.setZero();
    chassisBody.angularVelocity.setZero();
    chassisBody.quaternion.set(0, 0, 0, 1);
  }

  return { vehicle, chassisBody, car, wheelMeshes, reset, underglow, beam };
}
