#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const GENERATED_DIR = path.join(ROOT, ".generated");
const JOB_PATH = path.join(GENERATED_DIR, "identity-twin-job.json");
const TEST_ROOT = path.join(GENERATED_DIR, "topology-tests");
const MAX_MODEL_SIZE = 150 * 1024 * 1024;

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) {
      return;
    }
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  });
}

loadDotEnv(path.join(ROOT, ".env.local"));
loadDotEnv(path.join(ROOT, ".env"));

const API_BASE = process.env.TRIPO_API_BASE_URL || "https://api.tripo3d.ai/v2/openapi";
const API_KEY = process.env.TRIPO_API_KEY;
if (!API_KEY) {
  throw new Error("TRIPO_API_KEY_NOT_CONFIGURED");
}

function nowSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function callTripo(pathname, payload) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = { raw: text };
  }
  if (!response.ok || result.code && result.code !== 0) {
    const message = result?.message || result?.error || response.statusText;
    throw new Error(`TRIPO_API_ERROR ${response.status}: ${message}`);
  }
  return result;
}

function findNestedValue(value, keys) {
  if (!value || typeof value !== "object") {
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (keys.includes(key) && nested !== undefined && nested !== null && nested !== "") {
      return nested;
    }
    const found = findNestedValue(nested, keys);
    if (found !== null && found !== undefined && found !== "") {
      return found;
    }
  }
  return null;
}

function getTaskId(payload) {
  return findNestedValue(payload, ["task_id", "taskId", "id"]);
}

function getStatus(payload) {
  if (payload?.data?.status) {
    return String(payload.data.status).toLowerCase();
  }
  if (payload?.output?.status) {
    return String(payload.output.status).toLowerCase();
  }
  return String(
    findNestedValue(payload, ["status", "state", "task_status", "taskStatus"]) || "",
  ).toLowerCase();
}

function isComplete(status) {
  return ["success", "succeeded", "completed", "finished", "done"].some((value) => (
    status.includes(value)
  ));
}

function isFailed(status) {
  return ["failed", "error", "cancelled", "canceled"].some((value) => (
    status.includes(value)
  ));
}

function collectUrls(payload) {
  const urls = [];
  const visit = (value, pointer = "") => {
    if (typeof value === "string" && /^https:\/\//i.test(value)) {
      urls.push({ pointer, url: value, file: value.split("?")[0].split("/").pop() });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${pointer}[${index}]`));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, item]) => visit(item, pointer ? `${pointer}.${key}` : key));
    }
  };
  visit(payload);
  return urls;
}

function getModelUrl(payload, extensions) {
  return collectUrls(payload).find(({ url }) => (
    new RegExp(`\\.(${extensions.join("|")})(?:$|[?#])`, "i").test(url)
  ))?.url || null;
}

async function createTask(pathname, payload, variantDir, label) {
  saveJson(path.join(variantDir, `${label}.request.json`), payload);
  const result = await callTripo(pathname, payload);
  saveJson(path.join(variantDir, `${label}.create.json`), result);
  const id = getTaskId(result);
  if (!id) {
    throw new Error(`${label}: TRIPO_TASK_ID_MISSING`);
  }
  return id;
}

async function waitTask(taskId, variantDir, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await callTripo(`/tasks/${encodeURIComponent(taskId)}`);
    saveJson(path.join(variantDir, `${label}.poll.json`), result);
    const status = getStatus(result);
    process.stdout.write(`[${label}] ${taskId} ${status || "unknown"}\n`);
    if (isComplete(status)) {
      return result;
    }
    if (isFailed(status)) {
      throw new Error(`${label}: ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  throw new Error(`${label}: TIMEOUT`);
}

async function downloadModel(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DOWNLOAD_FAILED ${response.status}`);
  }
  const model = Buffer.from(await response.arrayBuffer());
  if (model.length > MAX_MODEL_SIZE) {
    throw new Error("MODEL_TOO_LARGE");
  }
  fs.writeFileSync(filePath, model);
}

function readGlbJson(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 4).toString("ascii") !== "glTF") {
    throw new Error(`${path.basename(filePath)} is not GLB`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
}

function summarizeGlb(filePath) {
  const gltf = readGlbJson(filePath);
  const nodes = gltf.nodes || [];
  const skins = gltf.skins || [];
  const jointNames = new Set();
  skins.forEach((skin) => {
    (skin.joints || []).forEach((jointIndex) => {
      const name = nodes[jointIndex]?.name;
      if (name) {
        jointNames.add(name);
      }
    });
  });
  const animationTargets = new Set();
  (gltf.animations || []).forEach((animation) => {
    (animation.channels || []).forEach((channel) => {
      const name = nodes[channel.target?.node]?.name;
      if (name) {
        animationTargets.add(name);
      }
    });
  });
  const primitives = (gltf.meshes || []).flatMap((mesh) => mesh.primitives || []);
  return {
    file: path.basename(filePath),
    bytes: fs.statSync(filePath).size,
    nodeCount: nodes.length,
    meshCount: (gltf.meshes || []).length,
    primitiveCount: primitives.length,
    skinCount: skins.length,
    skinJointCount: jointNames.size,
    animationCount: (gltf.animations || []).length,
    animationTargetCount: animationTargets.size,
    hasSkinWeights: primitives.some((primitive) => (
      primitive.attributes?.JOINTS_0 !== undefined
      && primitive.attributes?.WEIGHTS_0 !== undefined
    )),
    jointSample: [...jointNames].slice(0, 60),
    animationTargetSample: [...animationTargets].slice(0, 60),
  };
}

function compareModelAnimation(modelSummary, animationSummary) {
  const modelJoints = new Set(modelSummary.jointSample);
  const animationJoints = new Set(animationSummary.jointSample);
  return {
    sameSkinJointCount: modelSummary.skinJointCount === animationSummary.skinJointCount,
    modelSkinJointCount: modelSummary.skinJointCount,
    animationSkinJointCount: animationSummary.skinJointCount,
    animationTargetCount: animationSummary.animationTargetCount,
    modelAnimationCount: modelSummary.animationCount,
    animationAnimationCount: animationSummary.animationCount,
    sampledJointOverlap: [...animationJoints].filter((joint) => modelJoints.has(joint)).length,
  };
}

async function runVariant(runDir, rawTaskId, variant) {
  const variantDir = path.join(runDir, variant.name);
  fs.mkdirSync(variantDir, { recursive: true });
  const summary = {
    name: variant.name,
    mode: variant.mode,
    faceLimit: variant.faceLimit || null,
    startedAt: new Date().toISOString(),
    status: "running",
  };
  try {
    let modelInputTaskId = rawTaskId;
    if (variant.mode === "quad") {
      const retopoPayload = {
        input: rawTaskId,
        model: "v2.0",
        face_limit: variant.faceLimit,
        quad: true,
        bake: true,
      };
      summary.retopologyTaskId = await createTask("/mesh/decimate", retopoPayload, variantDir, "retopology");
      const retopoResult = await waitTask(summary.retopologyTaskId, variantDir, "retopology");
      summary.retopologyUrls = collectUrls(retopoResult).map(({ pointer, file }) => ({ pointer, file }));
      modelInputTaskId = summary.retopologyTaskId;
    }

    summary.modelInputTaskId = modelInputTaskId;
    summary.rigCheckTaskId = await createTask("/animations/rig-check", {
      input: modelInputTaskId,
    }, variantDir, "rigcheck");
    const rigCheckResult = await waitTask(summary.rigCheckTaskId, variantDir, "rigcheck");
    summary.riggable = findNestedValue(rigCheckResult, ["riggable"]);
    summary.rigType = findNestedValue(rigCheckResult, ["rig_type", "rigType"]) || "quadruped";

    summary.rigTaskId = await createTask("/animations/rig", {
      input: modelInputTaskId,
      model: "v2.5-20260210",
      rig_type: summary.rigType,
      spec: "tripo",
      out_format: "glb",
    }, variantDir, "rig");
    const rigResult = await waitTask(summary.rigTaskId, variantDir, "rig");
    summary.rigUrls = collectUrls(rigResult).map(({ pointer, file }) => ({ pointer, file }));
    const rigGlbUrl = getModelUrl(rigResult, ["glb", "gltf"]);
    if (rigGlbUrl) {
      const rigModelPath = path.join(variantDir, "rigged-model.glb");
      await downloadModel(rigGlbUrl, rigModelPath);
      summary.riggedModel = summarizeGlb(rigModelPath);
    }

    summary.animationTaskId = await createTask("/animations/retarget", {
      input: summary.rigTaskId,
      animation: "preset:quadruped:walk",
      out_format: "glb",
      bake_animation: true,
      animate_in_place: true,
    }, variantDir, "animation");
    const animationResult = await waitTask(summary.animationTaskId, variantDir, "animation");
    summary.animationUrls = collectUrls(animationResult).map(({ pointer, file }) => ({ pointer, file }));
    const animationGlbUrl = getModelUrl(animationResult, ["glb", "gltf"]);
    if (!animationGlbUrl) {
      throw new Error("ANIMATION_GLB_MISSING");
    }
    const animationPath = path.join(variantDir, "walking.glb");
    await downloadModel(animationGlbUrl, animationPath);
    summary.walking = summarizeGlb(animationPath);
    summary.modelForPlayback = summary.riggedModel || summary.walking;
    summary.compatibility = compareModelAnimation(summary.modelForPlayback, summary.walking);
    summary.status = "completed";
  } catch (error) {
    summary.status = "failed";
    summary.error = error.message;
  }
  summary.completedAt = new Date().toISOString();
  saveJson(path.join(variantDir, "summary.json"), summary);
  return summary;
}

async function main() {
  const savedJob = JSON.parse(fs.readFileSync(JOB_PATH, "utf8"));
  const rawTaskId = process.argv[2] || savedJob.rawModelTaskId || savedJob.sourceTaskId;
  if (!rawTaskId) {
    throw new Error("RAW_TASK_ID_MISSING");
  }
  const runDir = path.join(TEST_ROOT, nowSlug());
  fs.mkdirSync(runDir, { recursive: true });
  saveJson(path.join(runDir, "source-job.json"), savedJob);
  const variants = [
    { name: "raw-no-retopo", mode: "raw" },
    { name: "quad-6000", mode: "quad", faceLimit: 6000 },
    { name: "quad-8000", mode: "quad", faceLimit: 8000 },
    { name: "quad-10000", mode: "quad", faceLimit: 10000 },
  ];
  const results = [];
  for (const variant of variants) {
    process.stdout.write(`\n=== ${variant.name} ===\n`);
    const result = await runVariant(runDir, rawTaskId, variant);
    results.push(result);
    saveJson(path.join(runDir, "results.json"), {
      rawTaskId,
      runDir,
      updatedAt: new Date().toISOString(),
      results,
    });
  }
  saveJson(path.join(runDir, "results.json"), {
    rawTaskId,
    runDir,
    completedAt: new Date().toISOString(),
    results,
  });
  process.stdout.write(`\nSaved topology A/B test results to ${runDir}\n`);
  process.stdout.write(JSON.stringify(results.map((item) => ({
    name: item.name,
    status: item.status,
    error: item.error,
    riggable: item.riggable,
    rigType: item.rigType,
    modelSkinJointCount: item.modelForPlayback?.skinJointCount,
    walkingSkinJointCount: item.walking?.skinJointCount,
    walkingTargetCount: item.walking?.animationTargetCount,
    bytes: item.walking?.bytes,
  })), null, 2));
  process.stdout.write("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
