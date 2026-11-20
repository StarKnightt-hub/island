/** Small, rig-attached details that give the existing adult avatar a curly, equipped adventurer silhouette. */
import * as THREE from 'three/webgpu';

type SkinMesh = THREE.SkinnedMesh;

function pointsInModel(mesh: SkinMesh | null, model: THREE.Object3D) {
  if (!mesh) return [] as THREE.Vector3[];
  const points: THREE.Vector3[] = [];
  const p = new THREE.Vector3();
  const invModel = model.matrixWorld.clone().invert();
  for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
    mesh.getVertexPosition(i, p);
    points.push(p.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(invModel));
  }
  return points;
}

/** Geometry is authored in model space, then transformed into a bone's local frame so it follows the animation. */
function boneSpace(model: THREE.Object3D, bone: THREE.Object3D, name: string) {
  const group = new THREE.Group();
  group.name = name;
  group.matrixAutoUpdate = false;
  group.matrix.multiplyMatrices(bone.matrixWorld.clone().invert(), model.matrixWorld);
  group.matrixWorldNeedsUpdate = true;
  bone.add(group);
  return group;
}

function boneNamed(model: THREE.Object3D, name: string) {
  let found: THREE.Object3D | null = null;
  model.traverse((o) => { if (!found && o.name.replace(/[ _]/g, '') === name) found = o; });
  return found;
}

function addCurlyHair(model: THREE.Object3D, head: SkinMesh, headBone: THREE.Object3D) {
  const points = pointsInModel(head, model);
  if (!points.length) return;
  const box = new THREE.Box3().setFromPoints(points);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const rx = size.x * 0.5 * 1.025, ry = size.y * 0.5, rz = size.z * 0.5 * 1.035;
  const curls: { position: THREE.Vector3; normal: THREE.Vector3; size: number; turn: number }[] = [];

  // Close-set ringlets follow the skull from the crown to a natural hairline above the forehead and ears.
  for (let row = 0; row <= 5; row++) {
    const theta = row === 0 ? 0.08 : row * 0.22;
    if (theta > 1.18) continue;
    const circumference = 2 * Math.PI * rx * Math.sin(theta);
    const count = row === 0 ? 1 : Math.max(7, Math.round(circumference / 0.031));
    for (let i = 0; i < count; i++) {
      const phi = (i / count) * Math.PI * 2 + row * 0.17;
      const position = new THREE.Vector3(
        center.x + rx * Math.sin(theta) * Math.sin(phi),
        center.y + ry * Math.cos(theta),
        center.z + rz * Math.sin(theta) * Math.cos(phi),
      );
      const normal = new THREE.Vector3(
        (position.x - center.x) / (rx * rx),
        (position.y - center.y) / (ry * ry),
        (position.z - center.z) / (rz * rz),
      ).normalize();
      position.addScaledVector(normal, 0.004);
      curls.push({ position, normal, size: 0.88 + ((i * 17 + row * 11) % 9) * 0.035, turn: ((i * 13 + row * 7) % 11) * 0.31 });
    }
  }

  const geometry = new THREE.TorusGeometry(0.0105, 0.0048, 5, 9);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, vertexColors: true });
  const mesh = new THREE.InstancedMesh(geometry, material, curls.length);
  mesh.name = 'adventurer_curly_hair';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const zAxis = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion(), twist = new THREE.Quaternion();
  const scale = new THREE.Vector3(), matrix = new THREE.Matrix4();
  curls.forEach((curl, i) => {
    q.setFromUnitVectors(zAxis, curl.normal);
    twist.setFromAxisAngle(curl.normal, curl.turn);
    q.premultiply(twist);
    scale.setScalar(curl.size);
    matrix.compose(curl.position, q, scale);
    mesh.setMatrixAt(i, matrix);
    const shade = 0.72 + ((i * 23) % 13) * 0.018;
    mesh.setColorAt(i, new THREE.Color(0.12 * shade, 0.055 * shade, 0.025 * shade));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  boneSpace(model, headBone, 'hair_follow').add(mesh);
}

function addBelt(model: THREE.Object3D, body: SkinMesh | null, pelvis: THREE.Object3D) {
  const points = pointsInModel(body, model);
  const pelvisPosition = pelvis.getWorldPosition(new THREE.Vector3()).applyMatrix4(model.matrixWorld.clone().invert());
  const band = points.filter((p) => Math.abs(p.y - pelvisPosition.y) < 0.075 && Math.abs(p.x - pelvisPosition.x) < 0.3);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of band) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const cx = band.length ? (minX + maxX) * 0.5 : pelvisPosition.x;
  const cz = band.length ? (minZ + maxZ) * 0.5 : pelvisPosition.z;
  const rx = THREE.MathUtils.clamp(band.length ? (maxX - minX) * 0.5 + 0.014 : 0.17, 0.13, 0.22);
  const rz = THREE.MathUtils.clamp(band.length ? (maxZ - minZ) * 0.5 + 0.014 : 0.13, 0.105, 0.18);
  const y = pelvisPosition.y + 0.035;
  const group = boneSpace(model, pelvis, 'adventurer_utility_belt');
  const leather = new THREE.MeshStandardMaterial({ color: 0x3b2418, roughness: 0.72, metalness: 0.02 });
  const darkLeather = new THREE.MeshStandardMaterial({ color: 0x25170f, roughness: 0.78, metalness: 0 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9b7136, roughness: 0.38, metalness: 0.58 });

  const loop = new THREE.Mesh(new THREE.TorusGeometry(1, 0.085, 6, 48), leather);
  loop.name = 'belt_leather_band';
  loop.rotation.x = Math.PI * 0.5;
  loop.scale.set(rx, rz, 1);
  loop.position.set(cx, y, cz);
  loop.castShadow = true;
  group.add(loop);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.047, 0.014), brass);
  buckle.name = 'belt_brass_buckle';
  buckle.position.set(cx, y, cz + rz + 0.006);
  group.add(buckle);
  const pin = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.006, 0.018), darkLeather);
  pin.position.set(cx, y, cz + rz + 0.015);
  group.add(pin);

  for (const side of [-1, 1]) {
    const x = cx + side * rx * 0.72;
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.082, 0.052), darkLeather);
    pouch.name = side < 0 ? 'belt_left_pouch' : 'belt_right_pouch';
    pouch.position.set(x, y - 0.045, cz + rz * 0.45);
    pouch.castShadow = true;
    group.add(pouch);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.027, 0.055), leather);
    flap.position.set(x, y - 0.018, cz + rz * 0.48 + 0.004);
    group.add(flap);
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), brass);
    stud.position.set(x, y - 0.024, cz + rz * 0.48 + 0.034);
    group.add(stud);
  }
}

function addChestPocket(model: THREE.Object3D, body: SkinMesh | null, spine: THREE.Object3D) {
  const points = pointsInModel(body, model);
  const anchor = spine.getWorldPosition(new THREE.Vector3()).applyMatrix4(model.matrixWorld.clone().invert());
  const candidates = points.filter((p) => Math.abs(p.y - anchor.y) < 0.11 && Math.abs(p.x + 0.065) < 0.075);
  if (!candidates.length) return;
  let front = -Infinity;
  for (const p of candidates) front = Math.max(front, p.z);
  front += 0.008;
  const group = boneSpace(model, spine, 'shirt_chest_details');
  const fabric = new THREE.MeshStandardMaterial({ color: 0x263c30, roughness: 0.88, metalness: 0 });
  const stitch = new THREE.MeshStandardMaterial({ color: 0x8a8567, roughness: 0.88, metalness: 0 });
  const bodyPanel = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.088, 0.014), fabric);
  bodyPanel.name = 'field_shirt_chest_pocket';
  bodyPanel.position.set(-0.065, anchor.y - 0.025, front);
  bodyPanel.castShadow = true;
  group.add(bodyPanel);
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.025, 0.018), leatherMaterial());
  flap.position.set(-0.065, anchor.y + 0.011, front + 0.002);
  group.add(flap);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.002, 0.002), stitch);
  seam.position.set(-0.065, anchor.y - 0.002, front + 0.012);
  group.add(seam);
}

function leatherMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x493323, roughness: 0.74, metalness: 0.02 });
}

export function addAdventurerDetails(model: THREE.Object3D, body: SkinMesh | null, head: SkinMesh, hair: SkinMesh | null) {
  void hair;
  model.updateMatrixWorld(true);
  const headBone = boneNamed(model, 'Bip01Head');
  if (headBone) addCurlyHair(model, head, headBone);
  const pelvis = boneNamed(model, 'Bip01Pelvis');
  if (pelvis) addBelt(model, body, pelvis);
  const spine = boneNamed(model, 'Bip01Spine2');
  if (spine) addChestPocket(model, body, spine);
}
