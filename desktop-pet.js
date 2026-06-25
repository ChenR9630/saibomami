const desktopCat = document.querySelector("#desktopCat");
const desktopStatus = document.querySelector("#desktopStatus");
const desktopStage = document.querySelector("#desktopStage");
const desktopMode = new URLSearchParams(location.search).get("mode") === "free"
  ? "free"
  : "premium";
const scaleStorageKey = "neko.desktopPet.scale";
const nameStorageKey = "neko.desktopPet.petName";
const minDisplayScale = 0.6;
const maxDisplayScale = 1.5;
let displayScale = Number.parseFloat(localStorage.getItem(scaleStorageKey)) || 1;
let reconnectTimer = null;
let scaleStatusTimer = null;

// --- Interaction state ---
let localAction = null;
let localActionTimer = null;
let clickCount = 0;
let clickTimer = null;
let idleTimer = null;
let isMouseOverCat = false;
let mouseX = 0;
let mouseY = 0;
let customPendingActive = false;
let customPendingModelLoaded = false;
let customPendingActionTimer = null;
let customPendingActionIndex = 0;

// --- Chat state ---
const chatLayer = document.querySelector("#chatLayer");
const chatMessages = document.querySelector("#chatMessages");
const chatInput = document.querySelector("#chatInput");
const chatCloseBtn = document.querySelector("#chatCloseBtn");
const chatHint = document.querySelector("#chatHint");
const speechBubble = document.querySelector("#speechBubble");
let petName = localStorage.getItem(nameStorageKey) || "Neko";
let chatOpen = false;
let chatHistory = [];
let chatLoading = false;
let speechTimer = null;
let welcomeShown = false;

const petNameDisplay = document.querySelector("#petNameDisplay");
const petNameInput = document.querySelector("#petNameInput");

function updatePetNameDisplay() {
  petNameDisplay.textContent = petName;
  petNameInput.value = petName;
}

function savePetName(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  petName = trimmed;
  localStorage.setItem(nameStorageKey, petName);
  updatePetNameDisplay();
  petNameDisplay.classList.remove("is-editing");
}

const chatQuotaDisplay = document.querySelector("#chatQuotaDisplay");

function updateQuotaDisplay(quota) {
  if (!quota || quota.limit === Infinity) {
    chatQuotaDisplay.textContent = "";
    return;
  }
  const r = quota.remaining;
  if (r === 0) {
    chatQuotaDisplay.textContent = "已用完";
    chatQuotaDisplay.className = "chat-quota-display exhausted";
  } else {
    chatQuotaDisplay.textContent = `${r}次`;
    chatQuotaDisplay.className = "chat-quota-display";
  }
}

async function fetchQuotaStatus() {
  try {
    const r = await fetch("/api/subscription/status", { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      updateQuotaDisplay(data.chatQuota);
    }
  } catch {}
}

petNameDisplay.addEventListener("click", () => {
  petNameDisplay.classList.add("is-editing");
  petNameInput.focus();
  petNameInput.select();
});

petNameInput.addEventListener("blur", () => savePetName(petNameInput.value));
petNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") savePetName(petNameInput.value);
  if (e.key === "Escape") { petNameInput.value = petName; petNameDisplay.classList.remove("is-editing"); }
});

const actionLabels = {
  idle: "观察中", tracking: "轻微活动", walking: "缓慢行走", running: "快速奔跑",
  prowling: "低姿潜行", turning: "巡视转身", alert: "抬头观察", lying: "收腿伏卧",
  jumpStart: "起跳准备", jumping: "轻盈蹦跳", jumpFall: "空中下落", jumpEnd: "落地收势",
};

const idleAnimations = ["stretch", "lickPaw", "tailWag", "yawn", "earTwitch"];
const idleLabels = {
  stretch: "伸懒腰", lickPaw: "舔爪子", tailWag: "甩尾巴", yawn: "打哈欠", earTwitch: "抖耳朵",
};

// --- Core cat action ---
function setCatAction(action) {
  [...desktopCat.classList]
    .filter((c) => c.startsWith("is-"))
    .forEach((c) => desktopCat.classList.remove(c));
  desktopCat.classList.add(`is-${action}`);
}

function clearIdleAnimation() {
  idleAnimations.forEach((a) => desktopCat.classList.remove(`is-${a}`));
}

// --- Speech bubble ---
function showSpeech(text, thinking = false) {
  clearTimeout(speechTimer);
  speechBubble.querySelector("span").textContent = text;
  speechBubble.classList.remove("thinking");
  if (thinking) {
    speechBubble.classList.add("thinking");
  }
  speechBubble.classList.add("show");
  if (!thinking) {
    speechTimer = setTimeout(() => {
      speechBubble.classList.remove("show");
    }, Math.max(3000, text.length * 80));
  }
}

function hideSpeech() {
  speechBubble.classList.remove("show", "thinking");
}

// --- Click interaction ---
function triggerAction(action, duration) {
  localAction = action;
  clearTimeout(localActionTimer);
  clearIdleAnimation();
  setCatAction(action);
  desktopStatus.textContent = actionLabels[action] || action;
  window.twin3D?.setAction(action);
  localActionTimer = setTimeout(() => { localAction = null; }, duration || 2800);
}

// Left click → body actions (alert/jump/lying)
desktopStage.addEventListener("click", (e) => {
  if (chatOpen) return;
  clickCount++;
  clearTimeout(clickTimer);
  if (clickCount === 1) {
    clickTimer = setTimeout(() => { triggerAction("alert", 2000); clickCount = 0; }, 300);
  } else if (clickCount === 2) {
    clickTimer = setTimeout(() => { triggerAction("jumping", 2800); clickCount = 0; }, 300);
  } else {
    triggerAction("lying", 4000);
    clickCount = 0;
  }
});

// Right click → toggle chat
desktopStage.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (chatOpen) { closeChat(); } else { openChat(); }
});

// --- Cursor tracking ---
desktopStage.addEventListener("mousemove", (e) => {
  const rect = desktopStage.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
  const catCenterX = rect.width / 2;
  const catTopY = rect.height * 0.28;
  const catBottomY = rect.height * 0.72;
  const catHalfWidth = rect.width * 0.38;
  isMouseOverCat = (
    mouseX > catCenterX - catHalfWidth && mouseX < catCenterX + catHalfWidth
    && mouseY > catTopY && mouseY < catBottomY
  );
});

desktopStage.addEventListener("mouseleave", () => {
  isMouseOverCat = false;
  desktopCat.style.setProperty("--eye-x", "0px");
  desktopCat.style.setProperty("--eye-y", "0px");
  desktopCat.style.setProperty("--head-turn", "0deg");
});

function updateCursorTracking() {
  if (chatOpen || !isMouseOverCat) {
    desktopCat.style.setProperty("--eye-x", "0px");
    desktopCat.style.setProperty("--eye-y", "0px");
    desktopCat.style.setProperty("--head-turn", "0deg");
    return;
  }
  const rect = desktopStage.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height * 0.45;
  desktopCat.style.setProperty("--eye-x", `${Math.max(-4, Math.min(4, (mouseX - cx) * 0.025)).toFixed(1)}px`);
  desktopCat.style.setProperty("--eye-y", `${Math.max(-2, Math.min(2, (mouseY - cy) * 0.018)).toFixed(1)}px`);
  desktopCat.style.setProperty("--head-turn", `${Math.max(-5, Math.min(5, (mouseX - cx) * 0.03)).toFixed(1)}deg`);
}

// --- Idle animations ---
function isActiveMotion() { return Boolean(localAction) || chatOpen; }

function playIdleAnimation(anim) {
  if (isActiveMotion()) return;
  clearIdleAnimation();
  desktopCat.classList.add(`is-${anim}`);
  desktopStatus.textContent = idleLabels[anim] || anim;
  setTimeout(() => desktopCat.classList.remove(`is-${anim}`),
    anim === "tailWag" ? 1800 : anim === "earTwitch" ? 600 : anim === "yawn" ? 1500 : 1200);
}

function scheduleIdleAction() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!isActiveMotion() && !document.hidden) {
      playIdleAnimation(idleAnimations[Math.floor(Math.random() * idleAnimations.length)]);
    }
    scheduleIdleAction();
  }, 10000 + Math.random() * 20000);
}

// --- Chat ---
function openChat() {
  chatOpen = true;
  hideSpeech();
  chatLayer.classList.add("is-open");
  desktopCat.classList.add("is-talking");
  chatInput.focus();
  desktopStatus.classList.add("is-hidden");
  fetchQuotaStatus();
  if (!welcomeShown) {
    welcomeShown = true;
    addChatMessage("cat", "喵～ 我是" + petName + "，有什么想聊的？也可以把文件拖给我看看");
  }
}

function closeChat() {
  chatOpen = false;
  chatLayer.classList.remove("is-open");
  desktopCat.classList.remove("is-talking");
  hideSpeech();
  chatInput.value = "";
  chatHistory = [];
  chatMessages.innerHTML = "";
  desktopStatus.classList.remove("is-hidden");
}

function addChatMessage(role, text) {
  const el = document.createElement("div");
  el.className = `chat-msg ${role}`;
  el.textContent = text;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return el;
}

async function sendChatMessage(message) {
  if (chatLoading || !message.trim()) return;
  chatLoading = true;
  const userMsg = message.trim();
  chatInput.value = "";
  chatInput.disabled = true;
  addChatMessage("user", userMsg);
  chatHistory.push({ role: "user", content: userMsg });

  const loadingEl = addChatMessage("loading", petName + " 正在思考...");
  desktopCat.classList.add("is-talking");
  showSpeech("...", true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMsg, petName, history: chatHistory.slice(0, -1) }),
    });
    const payload = await response.json();
    loadingEl.remove();
    if (!response.ok) {
      if (payload.error === "DAILY_CHAT_LIMIT_REACHED") {
        throw new Error("DAILY_LIMIT");
      }
      throw new Error(payload.error || "CHAT_FAILED");
    }
    // Update quota display
    if (payload.quota) {
      updateQuotaDisplay(payload.quota);
    }

    chatHistory.push({ role: "assistant", content: payload.reply });
    addChatMessage("cat", payload.reply);
    hideSpeech();
    showSpeech(payload.reply.slice(0, 60) + (payload.reply.length > 60 ? "…" : ""));
    desktopCat.classList.remove("is-talking");
  } catch (err) {
    loadingEl.remove();
    let fallback;
    if (err.message === "DAILY_LIMIT") {
      fallback = "喵... 今天的免费对话次数用完啦～ 去控制台升级订阅就能无限畅聊喵！";
      updateQuotaDisplay({ remaining: 0, limit: 5 });
    } else if (err.message === "ARK_API_KEY_NOT_CONFIGURED") {
      fallback = "喵... 主人还没给我接上火山引擎的 API Key，我去不了云端 😿";
    } else {
      fallback = `喵呜... 脑子有点乱：${err.message}`;
    }
    addChatMessage("cat", fallback);
    hideSpeech();
    showSpeech(fallback);
    desktopCat.classList.remove("is-talking");
  } finally {
    chatLoading = false;
    chatInput.disabled = false;
    chatInput.focus();
  }
}

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChatMessage(chatInput.value);
  if (e.key === "Escape") closeChat();
});

chatCloseBtn.addEventListener("click", (e) => { e.stopPropagation(); closeChat(); });

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && chatOpen) closeChat();
});

// --- File drop ---
function readDroppedFile(file) {
  return new Promise((resolve, reject) => {
    const ext = (file.name || "").split(".").pop().toLowerCase();
    const textExts = new Set(["txt", "md", "js", "ts", "jsx", "tsx", "py", "html", "css",
      "json", "xml", "yaml", "yml", "csv", "log", "sh", "bash", "zsh", "rb", "go", "rs",
      "java", "c", "cpp", "h", "swift", "kt", "sql", "r", "toml", "ini", "cfg", "env"]);
    const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

    if (imageExts.has(ext)) {
      const reader = new FileReader();
      reader.onload = () => resolve({ type: "image", name: file.name, dataUrl: reader.result });
      reader.onerror = () => reject(new Error("无法读取图片"));
      reader.readAsDataURL(file);
      return;
    }

    if (textExts.has(ext) || file.size < 512 * 1024) {
      const reader = new FileReader();
      reader.onload = () => resolve({ type: "text", name: file.name, content: reader.result });
      reader.onerror = () => reject(new Error("无法读取文件"));
      reader.readAsText(file);
      return;
    }

    reject(new Error("不支持的文件类型，试试拖文本或图片文件给我吧～"));
  });
}

desktopStage.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
  desktopStage.classList.add("is-drop-target");
});

desktopStage.addEventListener("dragleave", () => {
  desktopStage.classList.remove("is-drop-target");
});

desktopStage.addEventListener("drop", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  desktopStage.classList.remove("is-drop-target");

  const file = e.dataTransfer.files[0];
  if (!file) return;

  if (!chatOpen) openChat();
  desktopCat.classList.add("is-talking");
  showSpeech("让我看看...", true);

  try {
    const result = await readDroppedFile(file);
    if (result.type === "image") {
      addChatMessage("user", `[投喂图片: ${result.name}]`);
      chatHistory.push({ role: "user", content: `[用户投喂了一张图片: ${result.name}]，请描述图片内容并回应` });
      const loadingEl = addChatMessage("loading", petName + " 正在看图...");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `看看这张图片：${result.name}`,
          petName,
          history: chatHistory.slice(0, -1),
          imageDataUrl: result.dataUrl,
        }),
      });
      const payload = await response.json();
      loadingEl.remove();
      if (!response.ok) throw new Error(payload.error);
      chatHistory.push({ role: "assistant", content: payload.reply });
      addChatMessage("cat", payload.reply);
      hideSpeech();
      showSpeech(payload.reply.slice(0, 60) + (payload.reply.length > 60 ? "…" : ""));
      desktopCat.classList.remove("is-talking");
    } else {
      const preview = result.content.slice(0, 300) + (result.content.length > 300 ? "…" : "");
      addChatMessage("user", `[投喂文件: ${result.name}]\n${preview}`);
      const filePrompt = `主人给我投喂了一个文件 "${result.name}"，内容是：\n\n${result.content.slice(0, 6000)}\n\n请阅读这个文件的内容并给出你的看法或总结。用猫咪口吻。`;
      chatHistory.push({ role: "user", content: filePrompt });
      const loadingEl = addChatMessage("loading", petName + " 正在阅读文件...");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: filePrompt, petName, history: chatHistory.slice(0, -1) }),
      });
      const payload = await response.json();
      loadingEl.remove();
      if (!response.ok) throw new Error(payload.error);
      chatHistory.push({ role: "assistant", content: payload.reply });
      addChatMessage("cat", payload.reply);
      hideSpeech();
      showSpeech(payload.reply.slice(0, 60) + (payload.reply.length > 60 ? "…" : ""));
      desktopCat.classList.remove("is-talking");
    }
  } catch (err) {
    hideSpeech();
    desktopCat.classList.remove("is-talking");
    addChatMessage("cat", `喵... ${err.message}`);
  } finally {
    chatInput.focus();
  }
});

// --- Existing functions ---
function applyDesktopAppearance(appearance) {
  const styles = ["original", "soft", "pixel", "neon", "mono"];
  const style = styles.includes(appearance?.style) ? appearance.style : "original";
  [...desktopCat.classList]
    .filter((c) => c.startsWith("skin-") || c.startsWith("texture-"))
    .forEach((c) => desktopCat.classList.remove(c));
  desktopCat.classList.add(`skin-${style}`);
  if (appearance?.texture) {
    desktopCat.classList.add(appearance.layout === "identity-atlas-v1" ? "texture-atlas" : "texture-photo");
  }
  desktopCat.style.setProperty("--pet-texture", appearance?.texture ? `url("${appearance.texture}")` : "none");
  desktopCat.style.setProperty("--pet-primary", appearance?.primary || "#d6d7cd");
  desktopCat.style.setProperty("--pet-secondary", appearance?.secondary || "#777c73");
}

function clampDisplayScale(s) { return Math.min(maxDisplayScale, Math.max(minDisplayScale, s)); }

function showScaleStatus() {
  window.clearTimeout(scaleStatusTimer);
  desktopStatus.textContent = `分身缩放 · ${Math.round(displayScale * 100)}%`;
  desktopStatus.classList.add("is-scaling");
  scaleStatusTimer = window.setTimeout(() => desktopStatus.classList.remove("is-scaling"), 1200);
}

function setDisplayScale(nextScale, announce = true) {
  const s = Number(nextScale);
  displayScale = clampDisplayScale(Number.isFinite(s) ? s : 1);
  localStorage.setItem(scaleStorageKey, displayScale.toFixed(2));
  desktopCat.style.setProperty("--device-scale", displayScale.toFixed(2));
  window.twin3D?.setScale(displayScale);
  if (announce) showScaleStatus();
  return displayScale;
}

function adjustDisplayScale(d) { return setDisplayScale(displayScale + Number(d || 0)); }

const customPendingActions = ["jumpStart", "jumping", "jumpFall", "jumpEnd", "running", "turning"];

async function ensureCustomPendingModel() {
  if (customPendingModelLoaded) return;
  if (!window.twin3D) {
    await new Promise((resolve) => window.addEventListener("twin3dready", resolve, { once: true }));
  }
  try {
    const r = await fetch("/api/twin/3d/master", { cache: "no-store" });
    const p = await r.json();
    if (p.modelUrl) {
      await window.twin3D.loadModel(p.modelUrl, {});
      window.twin3D.setScale(displayScale);
      customPendingModelLoaded = true;
    }
  } catch {
    desktopStatus.textContent = "等待特效加载失败";
    desktopStatus.classList.add("is-offline");
  }
}

function runCustomPendingAction() {
  const action = customPendingActions[customPendingActionIndex % customPendingActions.length];
  customPendingActionIndex += 1;
  clearIdleAnimation();
  setCatAction(action);
  window.twin3D?.setAction(action);
  window.twin3D?.setMotion({
    x: 0,
    y: action === "jumping" ? 0.42 : action === "running" ? 0.18 : 0.08,
    direction: action === "turning" ? 0.85 : 0,
    speed: action === "running" ? 0.86 : 0.42,
    intensity: action === "jumping" ? 0.92 : 0.62,
  });
}

function startCustomPendingEffect() {
  if (customPendingActive) return;
  customPendingActive = true;
  customPendingActionIndex = 0;
  document.body.classList.add("desktop-custom-pending");
  desktopStatus.textContent = "定制分身生成中 · 示例猫特效";
  desktopStatus.classList.remove("is-offline");
  ensureCustomPendingModel().then(runCustomPendingAction);
  window.clearInterval(customPendingActionTimer);
  customPendingActionTimer = window.setInterval(runCustomPendingAction, 1450);
  showSpeech("定制分身正在建模，我先用示例特效陪你。", false);
}

function stopCustomPendingEffect() {
  if (!customPendingActive) return;
  customPendingActive = false;
  document.body.classList.remove("desktop-custom-pending");
  window.clearInterval(customPendingActionTimer);
  customPendingActionTimer = null;
}

function applyDesktopState(state) {
  document.body.classList.toggle("desktop-twin-hidden", state.visible === false);
  if (state.visible === false) {
    stopCustomPendingEffect();
    desktopStatus.textContent = "桌面数字分身已隐藏";
    desktopStatus.classList.add("is-offline");
    window.twin3D?.setAction("idle");
    return;
  }
  if (state.displayMode === "custom-pending") {
    startCustomPendingEffect();
    applyDesktopAppearance(state.appearance);
    return;
  }
  stopCustomPendingEffect();
  if (!localAction && !chatOpen) {
    const action = actionLabels[state.action] ? state.action : "idle";
    clearIdleAnimation();
    setCatAction(action);
    window.twin3D?.setAction(action);
    if (!isActiveMotion()) {
      desktopStatus.textContent = `${actionLabels[action]} · ${Math.round((state.confidence || 0) * 100)}%`;
    }
  }
  const turn = Math.sign(state.direction || 0) * Math.min(15, 5 + (state.speed || 0) * 12);
  const lift = -Math.min(8, (state.intensity || 0) * 8);
  const scale = 0.9 + Math.min(0.08, (state.intensity || 0) * 0.08);
  desktopCat.style.setProperty("--twin-turn", `${turn.toFixed(1)}deg`);
  desktopCat.style.setProperty("--twin-y", `${lift.toFixed(1)}px`);
  desktopCat.style.setProperty("--twin-scale", scale.toFixed(3));
  window.twin3D?.setMotion({ x: 0, y: lift / -24, direction: state.direction || 0, speed: state.speed || 0, intensity: state.intensity || 0 });
  desktopStatus.classList.remove("is-offline");
  applyDesktopAppearance(state.appearance);
}

async function loadDesktopTwinModel() {
  if (desktopMode === "free") {
    document.body.classList.add("desktop-mode-free");
    desktopStatus.textContent = "免费赛博猫预览";
    return;
  }
  document.body.classList.add("desktop-mode-premium");
  if (!window.twin3D) return;
  try {
    const r = await fetch("/api/twin/3d", { cache: "no-store" });
    const p = await r.json();
    if (p.modelUrl) {
      await window.twin3D.loadModel(p.modelUrl, p.animations);
      window.twin3D.setScale(displayScale);
      desktopStatus.textContent = `数字分身已同步`;
    }
  } catch {
    desktopStatus.textContent = "数字分身加载失败";
    desktopStatus.classList.add("is-offline");
  }
}

function connectDesktopTwin() {
  window.clearTimeout(reconnectTimer);
  const events = new EventSource("/api/twin/events");
  events.onmessage = (e) => applyDesktopState(JSON.parse(e.data));
  events.onerror = () => {
    events.close();
    desktopStatus.textContent = "等待控制台服务";
    desktopStatus.classList.add("is-offline");
    reconnectTimer = window.setTimeout(connectDesktopTwin, 1500);
  };
}

// --- Init ---
desktopStage?.addEventListener("wheel", (event) => {
  event.preventDefault();
  adjustDisplayScale(event.deltaY < 0 ? 0.05 : -0.05);
}, { passive: false });

window.desktopPet = {
  adjustScale: adjustDisplayScale,
  resetScale: () => setDisplayScale(1),
  setScale: setDisplayScale,
};

function interactionLoop() {
  updateCursorTracking();
  requestAnimationFrame(interactionLoop);
}

setDisplayScale(displayScale, false);
scheduleIdleAction();
interactionLoop();

if (desktopMode === "premium") {
  window.addEventListener("twin3dready", loadDesktopTwinModel);
  loadDesktopTwinModel();
} else {
  loadDesktopTwinModel();
}
connectDesktopTwin();
