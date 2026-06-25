import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const params = new URLSearchParams(location.search);
const run = params.get("run") || "2026-06-22T14-10-41-107Z";
const variants = ["raw-no-retopo", "quad-6000", "quad-8000", "quad-10000"];
const grid = document.querySelector("#grid");
const runLabel = document.querySelector("#runLabel");
runLabel.textContent = run;

const loader = new GLTFLoader();

function fitModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1.35 / Math.max(size.x, size.y, size.z, 0.001);
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  const fitted = new THREE.Box3().setFromObject(model);
  model.position.y -= fitted.min.y;
}

async function mountVariant(variant) {
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `<div class="label"><strong>${variant}</strong><span class="meta">loading</span></div><div class="stage"></div>`;
  grid.appendChild(card);
  const stage = card.querySelector(".stage");
  const meta = card.querySelector(".meta");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(0, 0.45, 4.2);
  camera.lookAt(0, 0.25, 0);
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x46423f, 1.8));
  const key = new THREE.DirectionalLight(0xffead2, 2.1);
  key.position.set(-3, 4, 4);
  scene.add(key);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);

  const root = new THREE.Group();
  scene.add(root);

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  let mixer = null;
  const clock = new THREE.Clock();
  try {
    const url = `/api/twin/3d/topology-tests/${run}/${variant}/walking.glb`;
    const gltf = await loader.loadAsync(url);
    fitModel(gltf.scene);
    root.add(gltf.scene);
    mixer = new THREE.AnimationMixer(gltf.scene);
    if (gltf.animations[0]) {
      mixer.clipAction(gltf.animations[0]).play();
    }
    meta.textContent = `${gltf.animations.length} anim`;
  } catch (error) {
    meta.textContent = "failed";
    meta.style.color = "#ff6666";
    console.error(variant, error);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (mixer) {
      mixer.update(Math.min(0.05, clock.getDelta()));
    }
    root.rotation.y += 0.002;
    renderer.render(scene, camera);
  }
  frame();
}

variants.forEach((variant) => mountVariant(variant));
