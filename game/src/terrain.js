// The Kestrel Valley world: a heightfield valley with a grass-and-asphalt strip,
// a river, patchwork fields, pine forest and a rim of snowy peaks. One height
// function is shared by the mesh, the scenery placement and the flight model's
// ground collision, so what you see is exactly what you can hit.
export const RUNWAY = { halfWidth: 12, zMin: -120, zMax: 120, y: 0 };

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Deterministic little RNG so the valley is the same on every visit.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function riverCenterX(z) {
  return -300 + 110 * Math.sin(z * 0.0016) + 40 * Math.sin(z * 0.004 + 2.0);
}

// Ground height in metres at any point of the valley.
export function terrainHeight(x, z) {
  const distX = Math.abs(x);
  // Rolling hills that grow away from the valley floor.
  let hills = 16 * Math.sin(x * 0.004 + 1.7) * Math.cos(z * 0.0032)
    + 10 * Math.sin(x * 0.010 + 0.4) * Math.sin(z * 0.0075 + 0.6)
    + 5 * Math.sin((x + z) * 0.021);
  hills *= smoothstep(55, 430, distX);
  // The valley ends rise gently too, so you cannot fly out the back door.
  hills += 26 * smoothstep(700, 1500, Math.abs(z)) * (0.4 + 0.6 * smoothstep(0, 300, distX));
  // Rim mountains all around.
  const rimDist = Math.max(distX, Math.abs(z));
  const rim = smoothstep(1050, 1950, rimDist);
  hills += rim * (190 + 60 * Math.sin(Math.atan2(z, x) * 3 + 1.2));
  // The river shelf flattens the hills and carves a shallow channel.
  const riverDist = Math.abs(x - riverCenterX(z));
  hills *= 1 - 0.55 * (1 - smoothstep(0, 130, riverDist));
  hills -= 3.5 * (1 - smoothstep(0, 26, riverDist));
  // The strip and its apron are graded perfectly flat.
  const flat = (1 - smoothstep(46, 130, distX)) * (1 - smoothstep(215, 330, Math.abs(z)));
  return hills * (1 - flat);
}

function vertexColor(x, z, h, rng) {
  // Patchwork fields on the valley floor, forest on the slopes, rock and snow up high.
  const patch = Math.sin(x * 0.013 + Math.sin(z * 0.011) * 2.1) * Math.cos(z * 0.017 + Math.sin(x * 0.009) * 1.7);
  let r, g, b;
  if (h > 205) { r = 0.96; g = 0.97; b = 0.99; }                       // snow
  else if (h > 120) { r = 0.52; g = 0.50; b = 0.48; }                  // rock
  else if (h > 46) { r = 0.16; g = 0.34; b = 0.16; }                   // high forest
  else if (patch > 0.25) { r = 0.76; g = 0.66; b = 0.34; }             // wheat field
  else if (patch < -0.35) { r = 0.35; g = 0.55; b = 0.22; }            // pasture
  else { r = 0.42; g = 0.62; b = 0.26; }                               // meadow
  const jitter = (rng() - 0.5) * 0.05;
  return [r + jitter, g + jitter, b + jitter];
}

export function buildWorld(scene) {
  const rng = mulberry32(20261126);

  // Sky dome with a painted gradient, horizon haze at the bottom.
  const skyGeo = new THREE.SphereGeometry(3200, 24, 12);
  const skyColors = [];
  const posAttr = skyGeo.attributes.position;
  const top = new THREE.Color(0x2e6db0), horizon = new THREE.Color(0xd9eefb);
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i) / 3200;
    const c = horizon.clone().lerp(top, Math.pow(Math.max(0, y), 0.62));
    skyColors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  scene.add(sky);

  scene.fog = new THREE.Fog(0xcfe2f2, 500, 2900);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x51683c, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
  sun.position.set(700, 950, -500);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -420; sun.shadow.camera.right = 420;
  sun.shadow.camera.top = 420; sun.shadow.camera.bottom = -420;
  sun.shadow.camera.far = 3200;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // Heightfield terrain.
  const SIZE = 4400, SEG = 156;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const positions = geo.attributes.position;
  const colors = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const h = terrainHeight(x, z);
    positions.setY(i, h);
    colors.push(...vertexColor(x, z, h, rng));
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  buildRunway(scene);
  buildRiver(scene);
  buildForest(scene, rng);
  buildClouds(scene, rng);
  return { sun };
}

function buildRunway(scene) {
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.halfWidth * 2, RUNWAY.zMax - RUNWAY.zMin),
    new THREE.MeshLambertMaterial({ color: 0x3c4147 }));
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(0, 0.07, (RUNWAY.zMin + RUNWAY.zMax) / 2);
  asphalt.receiveShadow = true;
  scene.add(asphalt);

  const paint = new THREE.MeshBasicMaterial({ color: 0xf4f7f9 });
  // Centreline dashes.
  for (let z = RUNWAY.zMin + 14; z < RUNWAY.zMax - 8; z += 18) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 9), paint);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.1, z);
    scene.add(dash);
  }
  // Threshold bars at both ends.
  for (const endZ of [RUNWAY.zMin + 4, RUNWAY.zMax - 4]) {
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 6), paint);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(i * 3.1, 0.1, endZ);
      scene.add(bar);
    }
  }
  // Edge lights, warm amber, every 30 m.
  const lightGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  for (let z = RUNWAY.zMin; z <= RUNWAY.zMax; z += 30) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(lightGeo, lightMat);
      lamp.position.set(side * (RUNWAY.halfWidth + 1.6), 0.5, z);
      scene.add(lamp);
    }
  }
  // Hangar, hut and fuel drums on the apron.
  const hangar = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 20),
    new THREE.MeshLambertMaterial({ color: 0x8a4f35 }));
  walls.position.y = 4.5;
  walls.castShadow = true;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(13.6, 13.6, 20.6, 12, 1, false, 0, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0x5d6a72 }));
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.y = 9;
  hangar.add(walls, roof);
  hangar.position.set(38, 0, -148);
  scene.add(hangar);

  const hut = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8cfc0 }));
  hut.position.set(-30, 2, -136);
  hut.castShadow = true;
  scene.add(hut);
  const drumMat = new THREE.MeshLambertMaterial({ color: 0xb03a2e });
  for (let i = 0; i < 4; i++) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.1, 10), drumMat);
    drum.position.set(-24 + (i % 2) * 2.2, 1.05, -130 + Math.floor(i / 2) * 2.2);
    drum.castShadow = true;
    scene.add(drum);
  }
  // Windsock: pole and an orange cone that points downwind.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6),
    new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  pole.position.set(17, 3.5, -108);
  scene.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3.4, 8),
    new THREE.MeshLambertMaterial({ color: 0xff7f2a }));
  sock.rotation.z = Math.PI / 2.3;
  sock.position.set(18.6, 6.7, -108);
  scene.add(sock);
}

function buildRiver(scene) {
  const points = [];
  const STEP = 40, HALF = 13;
  for (let z = -2000; z <= 2000; z += STEP) {
    const cx = riverCenterX(z);
    points.push([cx - HALF, terrainHeight(cx - HALF, z), z, cx + HALF, terrainHeight(cx + HALF, z), z]);
  }
  const verts = [], idx = [];
  points.forEach(([lx, ly, lz, rx, ry, rz], i) => {
    verts.push(lx, ly + 0.35, lz, rx, ry + 0.35, rz);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const river = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x3d7ab8, transparent: true, opacity: 0.92 }));
  scene.add(river);
}

function buildForest(scene, rng) {
  const COUNT = 700;
  const coneGeo = new THREE.ConeGeometry(3.4, 11, 7);
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3, 6);
  const cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ color: 0x1e4d22 }), COUNT);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5d4230 }), COUNT);
  cones.castShadow = true;
  const dummy = new THREE.Object3D();
  let placed = 0, guard = 0;
  while (placed < COUNT && guard++ < 20000) {
    const x = (rng() - 0.5) * 3600;
    const z = (rng() - 0.5) * 3600;
    const h = terrainHeight(x, z);
    if (h < 6 || h > 165) continue;
    if (Math.abs(x) < 52 && Math.abs(z) < 260) continue;              // keep the strip clear
    if (Math.abs(x - riverCenterX(z)) < 30) continue;                 // not in the river
    const s = 0.75 + rng() * 0.9;
    dummy.position.set(x, h + 3 * s + 5.5 * s - 1, z);
    dummy.scale.setScalar(s);
    dummy.rotation.y = rng() * Math.PI;
    dummy.updateMatrix();
    cones.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = h + 1.5 * s - 0.4;
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  cones.count = placed;
  trunks.count = placed;
  scene.add(cones, trunks);
}

function buildClouds(scene, rng) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
  for (let i = 0; i < 24; i++) {
    const cloud = new THREE.Group();
    const puffs = 4 + Math.floor(rng() * 4);
    for (let p = 0; p < puffs; p++) {
      const r = 13 + rng() * 17;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
      puff.position.set((rng() - 0.5) * 34, (rng() - 0.5) * 6, (rng() - 0.5) * 18);
      puff.scale.y = 0.52;
      cloud.add(puff);
    }
    cloud.position.set((rng() - 0.5) * 3400, 165 + rng() * 90, (rng() - 0.5) * 3400);
    scene.add(cloud);
  }
}
