import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.querySelector("#twin3DCanvas, #desktopTwin3DCanvas");
const stage = document.querySelector("#petStage, #desktopStage");
const fallbackCat = document.querySelector("#cyberCat, #desktopCat");

window.twin3DBundleLoaded = true;
if (canvas && stage) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  camera.position.set(0, 0.42, 3.92);
  camera.lookAt(0, 0.24, 0);

  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x514944, 1.65));
  const keyLight = new THREE.DirectionalLight(0xffead2, 2.25);
  keyLight.position.set(-3.4, 4.8, 4.2);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffd8df, 0.85);
  fillLight.position.set(3.2, 1.8, 3.5);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xd9e9ff, 1.05);
  rimLight.position.set(4, 2.8, -3.5);
  scene.add(rimLight);
  const faceLight = new THREE.PointLight(0xfff3dc, 0.7, 5);
  faceLight.position.set(0, 1.2, 2.4);
  scene.add(faceLight);

  const motionRoot = new THREE.Group();
  const viewRoot = new THREE.Group();
  motionRoot.add(viewRoot);
  scene.add(motionRoot);

  let modelRoot = null;
  let cyberAssembly = null;
  let animationMixer = null;
  let animationActions = {};
  let activeAnimation = null;
  let usesNativeRig = false;
  let useProceduralNativeMotion = false;
  let semanticRig = null;
  let previousFrameTime = performance.now();
  let action = "idle";
  let actionStartedAt = performance.now();
  let turnDirection = 1;
  let viewAngle = 0;
  let displayScale = 1;
  let debugInfo = {
    retargets: [],
    targetBoneSample: [],
  };
  let motion = {
    x: 0,
    y: 0,
    direction: 0,
    speed: 0,
    intensity: 0,
  };
  let particlePalette = {
    primary: new THREE.Color(0xc9ff38),
    secondary: new THREE.Color(0x7de7ff),
  };

  function createNeonRig() {
    const group = new THREE.Group();
    const material = new THREE.LineBasicMaterial({
      color: 0xc9ff38,
      transparent: true,
      opacity: 0.82,
      depthTest: false,
    });
    const points = [
      [-0.68, 0.64, 0.03], [-0.38, 0.58, 0.02],
      [-0.38, 0.58, 0.02], [0.04, 0.55, 0],
      [0.04, 0.55, 0], [0.54, 0.53, -0.01],
      [-0.25, 0.52, 0], [-0.35, 0.12, 0.04],
      [-0.02, 0.49, 0], [-0.08, 0.1, 0.04],
      [0.28, 0.5, 0], [0.22, 0.1, 0.04],
      [0.52, 0.5, 0], [0.5, 0.12, 0.04],
      [0.52, 0.55, 0], [0.82, 0.72, -0.03],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.LineSegments(geometry, material));
    [
      [-0.68, 0.64, 0.03],
      [0.04, 0.55, 0],
      [0.52, 0.55, 0],
      [-0.35, 0.12, 0.04],
      [0.5, 0.12, 0.04],
    ].forEach(([x, y, z]) => {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xc9ff38, depthTest: false }),
      );
      marker.position.set(x, y, z);
      group.add(marker);
    });
    group.renderOrder = 20;
    return group;
  }

  function extractTriangles(sourceGeometry, triangleIds) {
    const geometry = new THREE.BufferGeometry();
    Object.entries(sourceGeometry.attributes).forEach(([name, attribute]) => {
      const AttributeType = attribute.array.constructor;
      const itemSize = attribute.itemSize;
      const values = new AttributeType(triangleIds.length * 3 * itemSize);
      let targetOffset = 0;
      triangleIds.forEach((triangleId) => {
        const sourceOffset = triangleId * 3 * itemSize;
        values.set(
          attribute.array.subarray(sourceOffset, sourceOffset + 3 * itemSize),
          targetOffset,
        );
        targetOffset += 3 * itemSize;
      });
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(values, itemSize, attribute.normalized),
      );
    });
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function createPartMesh(name, geometry, material, pivotMode = "center") {
    const bounds = geometry.boundingBox;
    const center = bounds.getCenter(new THREE.Vector3());
    const pivot = pivotMode === "top"
      ? new THREE.Vector3(center.x, bounds.max.y, center.z)
      : pivotMode === "front"
        ? new THREE.Vector3(center.x, center.y, bounds.max.z)
        : center;
    geometry.translate(-pivot.x, -pivot.y, -pivot.z);
    const group = new THREE.Group();
    group.name = name;
    group.position.copy(pivot);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${name}-identity-surface`;
    const wireframe = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0xc9ff38,
        wireframe: true,
        transparent: true,
        opacity: 0.075,
        depthWrite: false,
      }),
    );
    wireframe.scale.setScalar(1.002);
    wireframe.renderOrder = 8;
    mesh.add(wireframe);
    group.add(mesh);
    return group;
  }

  function createJoint(position, radius) {
    const joint = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 18, 18),
      new THREE.MeshStandardMaterial({
        color: 0x38432c,
        emissive: 0xc9ff38,
        emissiveIntensity: 2.8,
        roughness: 0.36,
        metalness: 0.76,
      }),
    );
    joint.position.copy(position);
    joint.renderOrder = 12;
    return joint;
  }

  function createArmorConnector(position, scale, rotation = [0, 0, 0]) {
    const connector = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.18, 8, 16),
      new THREE.MeshStandardMaterial({
        color: 0x20251f,
        emissive: 0x789c16,
        emissiveIntensity: 0.9,
        roughness: 0.28,
        metalness: 0.88,
      }),
    );
    connector.position.copy(position);
    connector.scale.set(...scale);
    connector.rotation.set(...rotation);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.092, 0.012, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xc9ff38 }),
    );
    ring.rotation.x = Math.PI / 2;
    connector.add(ring);
    return connector;
  }

  function addCyberConnectors(assembly, parts) {
    const connectors = new THREE.Group();
    connectors.name = "cyber-joint-connectors";
    if (parts.body) {
      const bodyBounds = new THREE.Box3().setFromObject(parts.body);
      const bodyCenter = bodyBounds.getCenter(new THREE.Vector3());
      const bodySize = bodyBounds.getSize(new THREE.Vector3());
      const core = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.052, 0.16, 10, 24),
        new THREE.MeshStandardMaterial({
          color: 0x181d18,
          emissive: 0x526b10,
          emissiveIntensity: 0.9,
          roughness: 0.24,
          metalness: 0.92,
        }),
      );
      core.position.set(
        bodyCenter.x,
        bodyBounds.min.y + bodySize.y * 0.2,
        bodyBounds.max.z + 0.035,
      );
      core.rotation.z = Math.PI / 2;
      core.scale.set(0.82, 1.08, 0.58);
      connectors.add(core);
      const spineCore = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.028, 0.13, 8, 18),
        new THREE.MeshStandardMaterial({
          color: 0x171b17,
          emissive: 0x6f9014,
          emissiveIntensity: 1.1,
          roughness: 0.24,
          metalness: 0.94,
        }),
      );
      spineCore.position.set(
        bodyCenter.x,
        core.position.y - 0.1,
        bodyBounds.max.z + 0.028,
      );
      spineCore.scale.z = 0.58;
      connectors.add(spineCore);
      const waistRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.09, 0.006, 8, 32),
        new THREE.MeshBasicMaterial({
          color: 0xc9ff38,
          transparent: true,
          opacity: 0.58,
        }),
      );
      waistRing.position.copy(core.position);
      waistRing.position.z += 0.034;
      waistRing.scale.y = 0.5;
      connectors.add(waistRing);
    }
    ["frontLeft", "frontRight", "backLeft", "backRight"].forEach((name) => {
      const part = parts[name];
      if (!part) {
        return;
      }
      const connector = createArmorConnector(
        part.position.clone().add(new THREE.Vector3(0, -0.015, 0.075)),
        [0.58, 0.62, 0.58],
        [0, 0, name.endsWith("Left") ? -0.12 : 0.12],
      );
      connectors.add(connector);
    });
    if (parts.head) {
      connectors.add(createArmorConnector(
        parts.head.position.clone().add(new THREE.Vector3(0, -0.11, 0.055)),
        [0.88, 0.46, 0.88],
        [Math.PI / 2, 0, 0],
      ));
    }
    if (parts.tail) {
      connectors.add(createArmorConnector(
        parts.tail.position.clone().add(new THREE.Vector3(0, 0, 0.035)),
        [0.48, 0.48, 0.48],
        [Math.PI / 2, 0, 0],
      ));
    }
    assembly.add(connectors);
    return connectors;
  }

  function createCyberAssembly(sourceScene) {
    sourceScene.updateMatrixWorld(true);
    const sourceMeshes = [];
    sourceScene.traverse((object) => {
      if (object.isMesh && object.geometry?.attributes?.position) {
        sourceMeshes.push(object);
      }
    });
    if (!sourceMeshes.length) {
      throw new Error("TWIN_3D_MESH_MISSING");
    }

    const sourceMesh = sourceMeshes[0];
    const geometry = sourceMesh.geometry.clone();
    geometry.applyMatrix4(sourceMesh.matrixWorld);
    const bounds = new THREE.Box3().setFromBufferAttribute(
      geometry.getAttribute("position"),
    );
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 1.75 / Math.max(size.x, size.y, size.z, 0.001);
    geometry.translate(-center.x, -bounds.min.y, -center.z);
    geometry.scale(scale, scale, scale);
    geometry.computeBoundingBox();

    const normalizedBounds = geometry.boundingBox;
    const normalizedSize = normalizedBounds.getSize(new THREE.Vector3());
    const segmentedGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = segmentedGeometry.getAttribute("position");
    const triangleCount = position.count / 3;
    const triangles = {
      body: [],
      head: [],
      tail: [],
      frontLeft: [],
      frontRight: [],
      backLeft: [],
      backRight: [],
    };
    const point = new THREE.Vector3();

    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      point.set(0, 0, 0);
      for (let vertex = 0; vertex < 3; vertex += 1) {
        point.x += position.getX(triangle * 3 + vertex);
        point.y += position.getY(triangle * 3 + vertex);
        point.z += position.getZ(triangle * 3 + vertex);
      }
      point.multiplyScalar(1 / 3);
      const x = point.x / normalizedSize.x;
      const y = point.y / normalizedSize.y;
      const z = point.z / normalizedSize.z;
      let part = "body";
      if (y > 0.62 && z > -0.2) {
        part = "head";
      } else if (z < -0.31 && y > 0.26) {
        part = "tail";
      } else if (y < 0.42) {
        const front = z > -0.03;
        if (front) {
          part = x < 0 ? "frontLeft" : "frontRight";
        } else {
          part = x < 0 ? "backLeft" : "backRight";
        }
      }
      triangles[part].push(triangle);
    }

    const material = sourceMesh.material;
    const assembly = new THREE.Group();
    assembly.name = "cyber-cat-assembly";
    const parts = {};
    const partSettings = {
      body: "center",
      head: "center",
      tail: "front",
      frontLeft: "top",
      frontRight: "top",
      backLeft: "top",
      backRight: "top",
    };
    Object.entries(partSettings).forEach(([name, pivotMode]) => {
      if (!triangles[name].length) {
        return;
      }
      const partGeometry = extractTriangles(segmentedGeometry, triangles[name]);
      const part = createPartMesh(name, partGeometry, material, pivotMode);
      parts[name] = part;
      assembly.add(part);
    });
    if (segmentedGeometry !== geometry) {
      segmentedGeometry.dispose();
    }
    geometry.dispose();

    ["head", "tail", "frontLeft", "frontRight", "backLeft", "backRight"]
      .forEach((name) => {
        if (!parts[name]) {
          return;
        }
        const radius = name === "head" ? 0.068 : 0.052;
        assembly.add(createJoint(parts[name].position, radius));
      });
    const connectors = addCyberConnectors(assembly, parts);

    assembly.position.y = -0.46;
    const restPose = {};
    Object.entries(parts).forEach(([name, part]) => {
      restPose[name] = {
        position: part.position.clone(),
        rotation: part.rotation.clone(),
        scale: part.scale.clone(),
      };
    });
    return { root: assembly, parts, connectors, restPose };
  }

  function createParticleGeometry(shape, count) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const colorA = particlePalette.primary;
    const colorB = particlePalette.secondary;
    const colorC = new THREE.Color(0xffffff);
    for (let index = 0; index < count; index += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
      const shell = 0.72 + Math.random() * 0.32;
      const x = Math.sin(phi) * Math.cos(theta) * shape.radius.x * shell;
      const y = Math.cos(phi) * shape.radius.y * shell;
      const z = Math.sin(phi) * Math.sin(theta) * shape.radius.z * shell;
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
      const color = Math.random() > 0.82 ? colorC : colorA.clone().lerp(colorB, Math.random() * 0.65);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  }

  function createParticlePart(name, position, radius, count) {
    const group = new THREE.Group();
    group.name = `particle-${name}`;
    group.position.copy(position);
    const particles = new THREE.Points(
      createParticleGeometry({ radius }, count),
      new THREE.PointsMaterial({
        size: 0.026,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    particles.name = `${name}-particle-cloud`;
    group.add(particles);
    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0xc9ff38,
        wireframe: true,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      }),
    );
    wire.scale.copy(radius);
    group.add(wire);
    return group;
  }

  function createParticleTail() {
    const group = new THREE.Group();
    group.name = "particle-tail";
    group.position.set(0.52, 0.56, 0);
    const positions = [];
    const colors = [];
    const lime = new THREE.Color(0xc9ff38);
    const cyan = new THREE.Color(0x7de7ff);
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.14, 0.1, 0.02),
      new THREE.Vector3(0.22, 0.26, 0.03),
      new THREE.Vector3(0.12, 0.42, 0.01),
      new THREE.Vector3(-0.02, 0.5, 0),
    ]);
    for (let ring = 0; ring < 34; ring += 1) {
      const t = ring / 33;
      const center = new THREE.Vector3(
        0,
        0,
        0,
      );
      center.copy(tailCurve.getPoint(t));
      const radius = 0.075 * (1 - t * 0.62);
      for (let point = 0; point < 8; point += 1) {
        const angle = (point / 8) * Math.PI * 2 + t * 1.6;
        positions.push(
          center.x + Math.cos(angle) * radius * 0.62,
          center.y + Math.sin(angle) * radius,
          center.z + THREE.MathUtils.randFloatSpread(0.025),
        );
        const color = lime.clone().lerp(cyan, t * 0.8);
        colors.push(color.r, color.g, color.b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    group.add(new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.024,
        vertexColors: true,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ));
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(tailCurve.getPoints(32)),
      new THREE.LineBasicMaterial({
        color: 0xc9ff38,
        transparent: true,
        opacity: 0.44,
        blending: THREE.AdditiveBlending,
      }),
    ));
    return group;
  }

  function createParticleCatAssembly() {
    const assembly = new THREE.Group();
    assembly.name = "particle-tech-cat";
    const parts = {
      body: createParticlePart(
        "body",
        new THREE.Vector3(0, 0.58, 0),
        new THREE.Vector3(0.58, 0.26, 0.28),
        820,
      ),
      head: createParticlePart(
        "head",
        new THREE.Vector3(-0.62, 0.78, 0.18),
        new THREE.Vector3(0.25, 0.22, 0.2),
        420,
      ),
      frontLeft: createParticlePart(
        "frontLeft",
        new THREE.Vector3(-0.35, 0.22, 0.16),
        new THREE.Vector3(0.08, 0.25, 0.07),
        170,
      ),
      frontRight: createParticlePart(
        "frontRight",
        new THREE.Vector3(-0.32, 0.22, -0.16),
        new THREE.Vector3(0.08, 0.25, 0.07),
        170,
      ),
      backLeft: createParticlePart(
        "backLeft",
        new THREE.Vector3(0.36, 0.2, 0.15),
        new THREE.Vector3(0.09, 0.25, 0.075),
        170,
      ),
      backRight: createParticlePart(
        "backRight",
        new THREE.Vector3(0.38, 0.2, -0.15),
        new THREE.Vector3(0.09, 0.25, 0.075),
        170,
      ),
      tail: createParticleTail(),
    };
    Object.values(parts).forEach((part) => assembly.add(part));
    const ears = [
      [-0.74, 1.0, 0.25, -0.2],
      [-0.5, 1.0, 0.25, 0.2],
    ];
    ears.forEach(([x, y, z, rotationZ]) => {
      const ear = new THREE.Mesh(
        new THREE.ConeGeometry(0.095, 0.22, 3),
        new THREE.MeshBasicMaterial({
          color: 0xc9ff38,
          transparent: true,
          opacity: 0.36,
          wireframe: true,
        }),
      );
      ear.position.set(x, y, z);
      ear.rotation.set(0.2, 0, rotationZ);
      assembly.add(ear);
    });
    const eyes = [
      [-0.72, 0.81, 0.38],
      [-0.52, 0.81, 0.38],
    ];
    eyes.forEach(([x, y, z]) => {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 12, 12),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.96,
        }),
      );
      eye.position.set(x, y, z);
      assembly.add(eye);
    });
    assembly.position.y = -0.52;
    assembly.rotation.y = 0;
    const restPose = {};
    Object.entries(parts).forEach(([name, part]) => {
      restPose[name] = {
        position: part.position.clone(),
        rotation: part.rotation.clone(),
        scale: part.scale.clone(),
      };
    });
    return { root: assembly, parts, restPose, kind: "particle" };
  }

  function loadParticleAvatar() {
    disposeModel({ revealFallback: false });
    modelRoot = new THREE.Group();
    cyberAssembly = createParticleCatAssembly();
    modelRoot.add(cyberAssembly.root);
    viewRoot.add(modelRoot);
    usesNativeRig = false;
    useProceduralNativeMotion = false;
    semanticRig = null;
    stage.dataset.semanticRig = "particle-cat";
    stage.classList.add("has-3d-model", "has-particle-avatar");
    fallbackCat?.setAttribute("aria-hidden", "true");
    setAction(action || "idle");
  }

  function setIdentityPalette(primary = "#c9ff38", secondary = "#7de7ff") {
    particlePalette = {
      primary: new THREE.Color(primary || "#c9ff38"),
      secondary: new THREE.Color(secondary || "#7de7ff"),
    };
    if (!cyberAssembly || cyberAssembly.kind !== "particle") {
      return;
    }
    const white = new THREE.Color(0xffffff);
    cyberAssembly.root.traverse((object) => {
      if (!object.isPoints || !object.geometry?.attributes?.color) {
        return;
      }
      const colorAttribute = object.geometry.attributes.color;
      const color = new THREE.Color();
      for (let index = 0; index < colorAttribute.count; index += 1) {
        const mix = (index % 17) / 16;
        color.copy(particlePalette.primary).lerp(particlePalette.secondary, mix * 0.72);
        if (index % 19 === 0) {
          color.lerp(white, 0.48);
        }
        colorAttribute.setXYZ(index, color.r, color.g, color.b);
      }
      colorAttribute.needsUpdate = true;
    });
  }

  function disposeModel(options = {}) {
    if (!modelRoot) {
      return;
    }
    modelRoot.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.filter(Boolean).forEach((material) => material.dispose());
    });
    viewRoot.remove(modelRoot);
    modelRoot = null;
    animationMixer = null;
    animationActions = {};
    activeAnimation = null;
    usesNativeRig = false;
    useProceduralNativeMotion = false;
    semanticRig = null;
    stage.classList.remove("has-3d-model", "has-particle-avatar");
    if (options.revealFallback !== false) {
      fallbackCat?.removeAttribute("aria-hidden");
    }
  }

  function stabilizeRootMotion(sourceClip) {
    const clip = sourceClip.clone();
    clip.tracks.forEach((track) => {
      if (!/(^|[/.])root(?:[/.]|$).*\.position$/i.test(track.name)) {
        return;
      }
      const stride = track.getValueSize();
      if (stride < 3 || track.values.length < 3) {
        return;
      }
      const originX = track.values[0];
      const originZ = track.values[2];
      for (let index = 0; index < track.values.length; index += stride) {
        track.values[index] = originX;
        track.values[index + 2] = originZ;
      }
    });
    return clip;
  }

  const masterCatRetargetMap = {
    root: "root",
    pelvis: "DEF-pelvis.C",
    body_bot: "DEF-spine",
    body: "DEF-spine.002",
    body_top0: "DEF-spine.004",
    body_top1: "DEF-spine.006",
    neck0: "neck",
    neck1: "head",
    head0: "head",
    tail0: "DEF-tail.001",
    tail1: "DEF-tail.001",
    tail2: "DEF-tail.002",
    tail3: "DEF-tail.002",
    tail4: "DEF-tail.003",
    tail5: "DEF-tail.004",
    tail6: "DEF-tail.004",
    leg_hind_left_top0: "DEF-thigh.L",
    leg_hind_left_top1: "DEF-thigh.L.001",
    leg_hind_left_bot0: "DEF-shin.L",
    leg_hind_left_ankle: "DEF-foot.L",
    leg_hind_left_toe: "DEF-r_toe.L",
    leg_hind_right_top0: "DEF-thigh.R",
    leg_hind_right_top1: "DEF-thigh.R.001",
    leg_hind_right_bot0: "DEF-shin.R",
    leg_hind_right_ankle: "DEF-foot.R",
    leg_hind_right_toe: "DEF-r_toe.R",
    leg_front_left_top0: "DEF-upper_arm.L",
    leg_front_left_top1: "DEF-upper_arm.L.001",
    leg_front_left_bot0: "DEF-forearm.L",
    leg_front_left_ankle: "DEF-hand.L",
    leg_front_left_toe: "DEF-f_toe.L",
    leg_front_right_top0: "DEF-upper_arm.R",
    leg_front_right_top1: "DEF-upper_arm.R.001",
    leg_front_right_bot0: "DEF-forearm.R",
    leg_front_right_ankle: "DEF-hand.R",
    leg_front_right_toe: "DEF-f_toe.R",
  };

  function collectBoneNames(rootObject) {
    const names = new Set();
    rootObject.traverse((object) => {
      if (object.name) {
        names.add(object.name);
      }
    });
    return names;
  }

  function collectBones(rootObject) {
    const bones = [];
    rootObject.updateMatrixWorld(true);
    rootObject.traverse((object) => {
      if (object.isBone) {
        const worldPosition = object.getWorldPosition(new THREE.Vector3());
        bones.push({
          object,
          name: object.name,
          worldPosition,
          restQuaternion: object.quaternion.clone(),
        });
      }
    });
    return bones;
  }

  function byTrailingIndex(a, b) {
    const getIndex = (name) => Number(name.match(/_(\d+)$/)?.[1] || 0);
    return getIndex(a.name) - getIndex(b.name);
  }

  function inferTripoSemanticRig(rootObject) {
    const bones = collectBones(rootObject);
    if (!bones.length) {
      stage.dataset.semanticRigDebug = "boneCount=0";
      return null;
    }
    const byName = new Map(bones.map((bone) => [bone.name, bone]));
    const root = bones.find((bone) => /Root$/i.test(bone.name)) || bones[0];
    const spine = bones
      .filter((bone) => /Spine_\d+$/i.test(bone.name))
      .sort(byTrailingIndex);
    const head = bones
      .filter((bone) => /Head_\d+$/i.test(bone.name))
      .sort(byTrailingIndex);
    const tail = bones
      .filter((bone) => /Tail_\d+$/i.test(bone.name))
      .sort(byTrailingIndex);
    const limbGroups = new Map();
    bones.forEach((bone) => {
      const match = bone.name.match(/(\d+)_(Left|Right)_Limb_(\d+)$/i);
      if (!match) {
        return;
      }
      const [, groupId, side] = match;
      const key = `${groupId}:${side.toLowerCase()}`;
      if (!limbGroups.has(key)) {
        limbGroups.set(key, []);
      }
      limbGroups.get(key).push(bone);
    });
    const limbs = [...limbGroups.entries()].map(([key, groupBones]) => {
      const [groupId, side] = key.split(":");
      const chain = groupBones.sort(byTrailingIndex);
      const shoulder = chain[0]?.worldPosition || new THREE.Vector3();
      return { groupId, side, chain, shoulder };
    });
    stage.dataset.semanticRigDebug = [
      `boneCount=${bones.length}`,
      `spine=${spine.length}`,
      `limbs=${limbs.length}`,
      `sample=${bones.slice(0, 10).map((bone) => bone.name).join(",")}`,
    ].join(";");
    if (!root || spine.length < 2 || limbs.length < 4) {
      return null;
    }
    const frontGroup = limbs.reduce((best, limb) => (
      !best || limb.shoulder.x > best.shoulder.x ? limb : best
    ), null)?.groupId;
    const roles = {};
    limbs.forEach((limb) => {
      const depth = limb.groupId === frontGroup ? "front" : "hind";
      const side = limb.side === "left" ? "Left" : "Right";
      roles[`${depth}${side}`] = limb.chain;
    });
    return {
      available: true,
      type: "tripo-quadruped",
      root: root.object,
      spine: spine.map((bone) => bone.object),
      head: head.map((bone) => bone.object),
      tail: tail.map((bone) => bone.object),
      legs: Object.fromEntries(
        Object.entries(roles).map(([role, chain]) => [
          role,
          chain.map((bone) => bone.object),
        ]),
      ),
      rest: new Map(bones.map((bone) => [bone.object.uuid, bone.restQuaternion])),
      summary: {
        boneCount: bones.length,
        root: root.name,
        spine: spine.map((bone) => bone.name),
        head: head.map((bone) => bone.name),
        tail: tail.map((bone) => bone.name),
        legs: Object.fromEntries(
          Object.entries(roles).map(([role, chain]) => [
            role,
            chain.map((bone) => bone.name),
          ]),
        ),
      },
    };
  }

  function inferSemanticRig(rootObject) {
    return inferTripoSemanticRig(rootObject);
  }

  function applyBoneOffset(bone, restMap, euler, influence = 1, settle = 0.18) {
    if (!bone) {
      return;
    }
    const rest = restMap.get(bone.uuid) || bone.quaternion;
    const offset = new THREE.Quaternion().setFromEuler(euler);
    const target = rest.clone().multiply(offset);
    bone.quaternion.slerp(target, settle * influence);
  }

  function applySemanticRigMotion(time, actionTime) {
    if (!semanticRig?.available || activeAnimation) {
      return;
    }
    const walking = action === "walking";
    const running = action === "running";
    const prowling = action === "prowling";
    const turning = action === "turning";
    const jumping = action === "jumping";
    const jumpStart = action === "jumpStart";
    const jumpFall = action === "jumpFall";
    const jumpEnd = action === "jumpEnd";
    const locomoting = walking || running || prowling || turning;
    const frequency = running ? 11 : prowling ? 4.2 : 7;
    const tripoRig = semanticRig.type === "tripo-quadruped";
    const stride = tripoRig
      ? 0
      : running ? 0.55 : prowling ? 0.22 : turning ? 0.28 : 0.38;
    const phase = time * frequency;
    const rest = semanticRig.rest;
    const settle = 0.2;

    const poseLeg = (chain, phaseOffset, amplitude = stride) => {
      if (!chain?.length) {
        return;
      }
      const swing = Math.sin(phase + phaseOffset) * amplitude;
      const lift = Math.max(0, Math.sin(phase + phaseOffset)) * amplitude;
      const axisScale = tripoRig ? 0.45 : 1;
      applyBoneOffset(chain[0], rest, new THREE.Euler(0, 0, swing * 0.55 * axisScale), 1, settle);
      applyBoneOffset(chain[1], rest, new THREE.Euler(0, 0, (-swing * 0.65 - lift * 0.25) * axisScale), 1, settle);
      applyBoneOffset(chain[2], rest, new THREE.Euler(0, 0, (swing * 0.32 + lift * 0.18) * axisScale), 1, settle);
    };

    if (locomoting) {
      poseLeg(semanticRig.legs.frontLeft, 0);
      poseLeg(semanticRig.legs.hindRight, 0);
      poseLeg(semanticRig.legs.frontRight, Math.PI);
      poseLeg(semanticRig.legs.hindLeft, Math.PI);
    }

    const crouch = jumpStart
      ? THREE.MathUtils.smoothstep(Math.min(actionTime, 0.5), 0, 0.5)
      : jumpEnd
        ? 1 - THREE.MathUtils.smoothstep(Math.min(actionTime, 0.7), 0, 0.7)
        : 0;
    const airborne = jumping || jumpFall;
    if (jumpStart || jumping || jumpFall || jumpEnd) {
      Object.values(semanticRig.legs).forEach((chain) => {
        applyBoneOffset(chain?.[0], rest, new THREE.Euler(0, 0, crouch * -0.45 + (airborne ? 0.34 : 0)), 1, settle);
        applyBoneOffset(chain?.[1], rest, new THREE.Euler(0, 0, crouch * 0.72 + (airborne ? -0.64 : 0)), 1, settle);
        applyBoneOffset(chain?.[2], rest, new THREE.Euler(0, 0, airborne ? 0.38 : 0), 1, settle);
      });
    }

    semanticRig.spine.forEach((bone, index) => {
      const wave = locomoting ? Math.sin(phase + index * 0.7) * (running ? 0.04 : 0.025) : 0;
      const tuck = crouch * -0.08 + (airborne ? 0.07 : 0);
      applyBoneOffset(bone, rest, new THREE.Euler(0, tuck, wave), 1, 0.12);
    });
    semanticRig.head.forEach((bone, index) => {
      const nod = locomoting ? Math.sin(phase + index * 0.35) * 0.035 : 0;
      applyBoneOffset(bone, rest, new THREE.Euler(0, nod, turning ? turnDirection * 0.16 : 0), 1, 0.12);
    });
    semanticRig.tail.forEach((bone, index) => {
      const wag = Math.sin(time * (locomoting ? frequency * 0.74 : 2.1) + index * 0.6)
        * (running ? 0.28 : locomoting ? 0.2 : 0.12);
      applyBoneOffset(bone, rest, new THREE.Euler(0, wag, jumping ? 0.22 : 0), 1, 0.16);
    });
  }

  function retargetClipToModel(sourceClip, targetBoneNames, forceMasterCatRetarget = false) {
    const hasSourceRigTracks = sourceClip.tracks.some((track) => {
      const sourceBoneName = track.name.match(/^(.+)\.(position|quaternion|scale)$/)?.[1];
      return Boolean(sourceBoneName && masterCatRetargetMap[sourceBoneName]);
    });
    const hasMasterCatTargets = (
      targetBoneNames.has("DEF-spine.006")
      && targetBoneNames.has("DEF-thigh.L")
      && !targetBoneNames.has("tail0")
    );
    const shouldUseMasterMap = hasSourceRigTracks && (forceMasterCatRetarget || hasMasterCatTargets);
    if (!shouldUseMasterMap) {
      debugInfo.retargets.push({
        clip: sourceClip.name,
        mode: "none",
        targetBoneCount: targetBoneNames.size,
        targetBoneSample: [...targetBoneNames].slice(0, 30),
      });
      return sourceClip;
    }
    const tracks = [];
    let skipped = 0;
    sourceClip.tracks.forEach((track) => {
      const match = track.name.match(/^(.+)\.(position|quaternion|scale)$/);
      if (!match) {
        skipped += 1;
        return;
      }
      const [, sourceBoneName, propertyName] = match;
      const targetBoneName = masterCatRetargetMap[sourceBoneName] || sourceBoneName;
      if (!forceMasterCatRetarget && !targetBoneNames.has(targetBoneName)) {
        skipped += 1;
        return;
      }
      if (propertyName === "position" && sourceBoneName !== "root") {
        skipped += 1;
        return;
      }
      if (propertyName === "scale") {
        skipped += 1;
        return;
      }
      const clonedTrack = track.clone();
      clonedTrack.name = `${targetBoneName}.${propertyName}`;
      tracks.push(clonedTrack);
    });
    debugInfo.retargets.push({
      clip: sourceClip.name,
      mode: "master-cat",
      inputTrackCount: sourceClip.tracks.length,
      outputTrackCount: tracks.length,
      skippedTrackCount: skipped,
      outputTrackSample: tracks.slice(0, 30).map((track) => track.name),
    });
    if (!tracks.length) {
      return sourceClip;
    }
    return new THREE.AnimationClip(
      `${sourceClip.name || "clip"}-master-cat-retarget`,
      sourceClip.duration,
      tracks,
    );
  }

  async function loadModel(url, animationUrls = {}) {
    if (!url) {
      return;
    }
    const gltf = await new GLTFLoader().loadAsync(url);
    disposeModel();
    debugInfo = {
      retargets: [],
      targetBoneSample: [],
      semanticRig: null,
    };
    modelRoot = new THREE.Group();
    usesNativeRig = false;
    gltf.scene.traverse((object) => {
      if (object.isSkinnedMesh || object.isBone) {
        usesNativeRig = true;
      }
    });
    if (usesNativeRig) {
      const identityModel = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(identityModel);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = 1.48 / Math.max(size.x, size.y, size.z, 0.001);
      identityModel.scale.setScalar(scale);
      identityModel.position.set(
        -center.x * scale,
        -center.y * scale,
        -center.z * scale,
      );
      const normalizedBounds = new THREE.Box3().setFromObject(identityModel);
      identityModel.position.y -= normalizedBounds.min.y;
      modelRoot.add(identityModel);
      animationMixer = new THREE.AnimationMixer(identityModel);
      const targetBoneNames = collectBoneNames(identityModel);
      const isTripoRig = [...targetBoneNames].some((boneName) => /^tripo(?:::|Root|Spine|Head|Tail|\d+_)/i.test(boneName));
      if (isTripoRig) {
        identityModel.rotation.y = Math.PI / 2;
      }
      semanticRig = inferSemanticRig(identityModel);
      useProceduralNativeMotion = Boolean(isTripoRig && semanticRig?.available);
      const forceMasterCatRetarget = /\/api\/twin\/3d\/master\/model(?:$|[?])/i.test(url);
      debugInfo.targetBoneSample = [...targetBoneNames].slice(0, 80);
      debugInfo.semanticRig = semanticRig?.summary || null;
      stage.dataset.semanticRig = semanticRig?.available ? semanticRig.type : "";
      const loadedAnimations = await Promise.all(
        Object.entries(animationUrls)
          .filter(([, animationUrl]) => animationUrl)
          .map(async ([name, animationUrl]) => {
            const animationGltf = await new GLTFLoader().loadAsync(animationUrl);
            return [name, animationGltf.animations[0] || null];
          }),
      );
      animationActions = Object.fromEntries(
        loadedAnimations
          .filter(([, clip]) => clip && !useProceduralNativeMotion)
          .map(([name, clip]) => {
            const retargetedClip = retargetClipToModel(
              clip,
              targetBoneNames,
              forceMasterCatRetarget,
            );
            const clipAction = animationMixer.clipAction(stabilizeRootMotion(retargetedClip));
            const oneShot = new Set(["jumpStart", "jumpFall", "jumpEnd"]);
            clipAction.clampWhenFinished = oneShot.has(name);
            clipAction.loop = oneShot.has(name) ? THREE.LoopOnce : THREE.LoopRepeat;
            return [name, clipAction];
          }),
      );
      cyberAssembly = null;
    } else {
      stage.dataset.semanticRig = "";
      cyberAssembly = createCyberAssembly(gltf.scene);
      modelRoot.add(cyberAssembly.root);
    }
    viewRoot.add(modelRoot);
    action = "idle";
    actionStartedAt = performance.now();
    motionRoot.position.set(0, 0, 0);
    motionRoot.rotation.set(0, 0, 0);
    motionRoot.scale.set(1, 1, 1);
    viewRoot.rotation.set(0, 0, 0);
    viewAngle = 0;
    stage.classList.add("has-3d-model");
    fallbackCat?.setAttribute("aria-hidden", "true");
    setAction("idle");
  }

  function setAction(nextAction) {
    const next = nextAction || "idle";
    const actionChanged = next !== action;
    if (actionChanged) {
      action = next;
      actionStartedAt = performance.now();
    }
    if (usesNativeRig && animationMixer) {
      const nativeProfiles = {
        idle: ["idle", 1],
        walking: ["walking", 1],
        running: ["walking", 1.28],
        prowling: ["walking", 0.48],
        turning: ["walking", 0.62],
        jumpStart: ["jumpStart", 1],
        jumping: ["jumping", 1],
        jumpFall: ["jumpFall", 1],
        jumpEnd: ["jumpEnd", 1],
      };
      const [animationName, timeScale] = nativeProfiles[next] || nativeProfiles.idle;
      const nextAnimation = animationActions[animationName]
        || (["jumpStart", "jumping", "jumpFall", "jumpEnd"].includes(next)
          ? animationActions.idle
          : null)
        || null;
      if (nextAnimation && nextAnimation !== activeAnimation) {
        nextAnimation.reset().setEffectiveWeight(1).fadeIn(0.35).play();
        activeAnimation?.fadeOut(0.42);
        activeAnimation = nextAnimation;
      } else if (!nextAnimation && activeAnimation) {
        activeAnimation.fadeOut(0.35);
        activeAnimation = null;
      }
      if (nextAnimation) {
        nextAnimation.setEffectiveTimeScale(timeScale);
      }
      if (next === "turning" && actionChanged) {
        turnDirection *= -1;
      }
    }
  }

  function setMotion(nextMotion) {
    motion = { ...motion, ...nextMotion };
  }

  function setView(nextView) {
    viewAngle = Number(nextView) * THREE.MathUtils.degToRad(32);
  }

  function setScale(nextScale) {
    const parsedScale = Number(nextScale);
    displayScale = Number.isFinite(parsedScale)
      ? THREE.MathUtils.clamp(parsedScale, 0.6, 1.5)
      : 1;
    viewRoot.scale.setScalar(displayScale);
    return displayScale;
  }

  function resize() {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render(timeMs) {
    const delta = Math.min(0.05, Math.max(0, (timeMs - previousFrameTime) / 1000));
    previousFrameTime = timeMs;
    animationMixer?.update(delta);
    const time = timeMs / 1000;
    const actionTime = Math.max(0, (timeMs - actionStartedAt) / 1000);
    const walking = action === "walking";
    const running = action === "running";
    const prowling = action === "prowling";
    const turning = action === "turning";
    const jumping = action === "jumping";
    const lying = action === "lying";
    const alert = action === "alert";
    const locomoting = walking || running || prowling || turning;
    applySemanticRigMotion(time, actionTime);
    const gaitFrequency = running ? 11 : prowling ? 4.2 : 7;
    const bob = locomoting
      ? Math.abs(Math.sin(time * gaitFrequency)) * (running ? 0.075 : prowling ? 0.025 : 0.055)
      : Math.sin(time * 1.8) * 0.012;
    const jumpCycle = Math.min(actionTime, 1.8);
    const jumpLift = usesNativeRig || !jumping
      ? 0
      : jumpCycle < 0.28
        ? -THREE.MathUtils.smoothstep(jumpCycle, 0, 0.28) * 0.08
        : jumpCycle < 0.62
          ? THREE.MathUtils.smoothstep(jumpCycle, 0.28, 0.62) * 0.5
          : jumpCycle < 1.18
            ? 0.5 - THREE.MathUtils.smoothstep(jumpCycle, 0.62, 1.18) * 0.08
            : 0.42 - THREE.MathUtils.smoothstep(jumpCycle, 1.18, 1.8) * 0.42;
    const targetScaleY = !usesNativeRig && jumping && jumpCycle < 0.28 ? 0.92 : 1;
    motionRoot.scale.y += (targetScaleY - motionRoot.scale.y) * 0.12;
    motionRoot.position.x += (motion.x * 0.5 - motionRoot.position.x) * 0.08;
    const poseHeight = modelRoot && prowling ? -0.1 : 0;
    motionRoot.position.y += (
      bob + poseHeight + jumpLift + motion.y * 0.12
      - (lying ? 0.1 : 0) - motionRoot.position.y
    ) * 0.1;
    motionRoot.rotation.z = locomoting ? Math.sin(time * gaitFrequency) * 0.025 : 0;
    const turnOffset = modelRoot && turning
      ? turnDirection * THREE.MathUtils.smoothstep(Math.min(actionTime, 1.8), 0, 1.8) * Math.PI
      : 0;
    const poseView = usesNativeRig
      ? 0
      : lying
      ? THREE.MathUtils.degToRad(10)
      : jumping
        ? THREE.MathUtils.degToRad(16)
        : 0;
    viewRoot.rotation.y += (
      viewAngle + turnOffset + poseView + motion.direction * 0.08 - viewRoot.rotation.y
    ) * 0.08;
    viewRoot.rotation.x += (((alert ? -0.07 : 0)) - viewRoot.rotation.x) * 0.08;
    if (cyberAssembly && !usesNativeRig) {
      const { parts, restPose } = cyberAssembly;
      if (cyberAssembly.kind === "particle") {
        cyberAssembly.root.rotation.z = Math.sin(time * 1.2) * 0.018;
        cyberAssembly.root.traverse((object) => {
          if (object.isPoints) {
            object.rotation.y += delta * 0.08;
            if (object.material) {
              object.material.opacity = 0.78 + Math.sin(time * 2.1 + object.id) * 0.12;
            }
          }
        });
      }
      const stride = running ? 0.64 : prowling ? 0.28 : turning ? 0.2 : walking ? 0.48 : 0;
      const step = locomoting ? Math.sin(time * gaitFrequency) * stride : 0;
      const rearStep = locomoting
        ? Math.sin(time * gaitFrequency + Math.PI) * stride * 0.88
        : 0;
      const crouch = jumping && jumpCycle < 0.28
        ? THREE.MathUtils.smoothstep(jumpCycle, 0, 0.28)
        : 0;
      const airborne = jumping && jumpCycle >= 0.28 && jumpCycle < 1.18
        ? Math.sin(((jumpCycle - 0.28) / 0.9) * Math.PI)
        : 0;
      const landing = jumping && jumpCycle >= 1.18
        ? 1 - THREE.MathUtils.smoothstep(jumpCycle, 1.18, 1.8)
        : 0;
      const settle = lying ? 0.08 : 0.14;
      const posePart = (
        name,
        rotationX = 0,
        rotationZ = 0,
        offset = null,
        scale = null,
      ) => {
        const part = parts[name];
        if (!part) {
          return;
        }
        const rest = restPose[name];
        part.rotation.x += (rest.rotation.x + rotationX - part.rotation.x) * settle;
        part.rotation.z += (rest.rotation.z + rotationZ - part.rotation.z) * settle;
        const targetPosition = rest.position.clone().add(offset || new THREE.Vector3());
        part.position.lerp(targetPosition, settle);
        part.scale.lerp(scale || rest.scale, settle);
      };
      if (lying) {
        const tuckedScale = new THREE.Vector3(0.94, 0.28, 0.92);
        posePart("frontLeft", 0.08, -0.04, new THREE.Vector3(0.015, 0.01, -0.035), tuckedScale);
        posePart("frontRight", 0.08, 0.04, new THREE.Vector3(-0.015, 0.01, -0.035), tuckedScale);
        posePart("backLeft", -0.06, -0.04, new THREE.Vector3(0.018, 0.015, 0.025), tuckedScale);
        posePart("backRight", -0.06, 0.04, new THREE.Vector3(-0.018, 0.015, 0.025), tuckedScale);
        posePart(
          "body",
          0.02,
          0,
          new THREE.Vector3(0, -0.16, -0.008),
          new THREE.Vector3(1.03, 0.86, 1.06),
        );
        posePart("head", -0.04, 0, new THREE.Vector3(0, -0.105, 0.035));
      } else {
        const frontFold = crouch * 0.48 - airborne * 0.82 + landing * 0.28;
        const rearFold = crouch * -0.62 + airborne * 0.96 - landing * 0.38;
        posePart("frontLeft", frontFold + step);
        posePart("frontRight", frontFold - step);
        posePart("backLeft", rearFold + rearStep);
        posePart("backRight", rearFold - rearStep);
        posePart(
          "body",
          jumping ? -0.04 + airborne * 0.1 : running ? -0.08 : prowling ? 0.04 : 0,
          0,
          prowling ? new THREE.Vector3(0, -0.07, 0.02) : null,
        );
        posePart(
          "head",
          alert ? -0.22 : jumping ? -0.08 + airborne * 0.14 : prowling ? 0.12 : 0,
          0,
          prowling ? new THREE.Vector3(0, -0.08, 0.055) : null,
        );
      }
      if (parts.tail) {
        parts.tail.rotation.y += (
          Math.sin(time * (locomoting ? gaitFrequency * 0.74 : 2.1))
          * (running ? 0.46 : locomoting ? 0.34 : 0.18)
          - parts.tail.rotation.y
        ) * 0.1;
        parts.tail.rotation.x += (
          (lying ? -0.28 : jumping ? 0.24 + airborne * 0.42 : 0)
          - parts.tail.rotation.x
        ) * 0.1;
      }
      if (parts.body && !lying && !jumping) {
        parts.body.rotation.z += (
          (locomoting ? Math.sin(time * gaitFrequency) * 0.035 : 0)
          - parts.body.rotation.z
        ) * 0.12;
      }
    }
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  new ResizeObserver(resize).observe(stage);
  resize();
  loadParticleAvatar();
  requestAnimationFrame(render);

  window.twin3D = {
    clearModel: loadParticleAvatar,
    loadParticleAvatar,
    loadModel,
    setAction,
    setMotion,
    setIdentityPalette,
    setScale,
    setView,
    getDebugInfo: () => debugInfo,
  };
  window.dispatchEvent(new CustomEvent("twin3dready"));
}
