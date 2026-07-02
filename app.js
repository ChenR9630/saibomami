const elements = {
  cameraButton: document.querySelector("#cameraButton"),
  cameraButtonLabel: document.querySelector("#cameraButtonLabel"),
  cameraDevice: document.querySelector("#cameraDevice"),
  refreshDevicesButton: document.querySelector("#refreshDevicesButton"),
  calibrateButton: document.querySelector("#calibrateButton"),
  remoteCameraButton: document.querySelector("#remoteCameraButton"),
  desktopTwinButton: document.querySelector("#desktopTwinButton"),
  desktopTwinButtonLabel: document.querySelector("#desktopTwinButtonLabel"),
  catSkinButton: document.querySelector("#catSkinButton"),
  catSkinButtonLabel: document.querySelector("#catSkinButtonLabel"),
  skinControlHint: document.querySelector("#skinControlHint"),
  protocolLabel: document.querySelector("#protocolLabel"),
  demoButton: document.querySelector("#demoButton"),
  pauseButton: document.querySelector("#pauseButton"),
  soundButton: document.querySelector("#soundButton"),
  accountChip: document.querySelector("#accountChip"),
  loginButton: document.querySelector("#loginButton"),
  registerButton: document.querySelector("#registerButton"),
  logoutButton: document.querySelector("#logoutButton"),
  authDialog: document.querySelector("#authDialog"),
  authCloseButton: document.querySelector("#authCloseButton"),
  authTitle: document.querySelector("#authTitle"),
  authMethodTabs: document.querySelector("#authMethodTabs"),
  authRegisterTab: document.querySelector("#authRegisterTab"),
  authLoginTab: document.querySelector("#authLoginTab"),
  authFieldsEmail: document.querySelector("#authFieldsEmail"),
  authFieldsPhone: document.querySelector("#authFieldsPhone"),
  authFieldsWechat: document.querySelector("#authFieldsWechat"),
  authNicknameInput: document.querySelector("#authNicknameInput"),
  authEmailInput: document.querySelector("#authEmailInput"),
  authPasswordInput: document.querySelector("#authPasswordInput"),
  authPasswordConfirmField: document.querySelector("#authPasswordConfirmField"),
  authPasswordConfirmInput: document.querySelector("#authPasswordConfirmInput"),
  authPhoneInput: document.querySelector("#authPhoneInput"),
  authCodeInput: document.querySelector("#authCodeInput"),
  authPhonePasswordInput: document.querySelector("#authPhonePasswordInput"),
  authSendCodeBtn: document.querySelector("#authSendCodeBtn"),
  authWechatQr: document.querySelector("#authWechatQr"),
  authSubmitButton: document.querySelector("#authSubmitButton"),
  authStatus: document.querySelector("#authStatus"),
  cameraFeed: document.querySelector("#cameraFeed"),
  poseCanvas: document.querySelector("#poseCanvas"),
  cameraPlaceholder: document.querySelector("#cameraPlaceholder"),
  cameraStatus: document.querySelector("#cameraStatus"),
  resolutionLabel: document.querySelector("#resolutionLabel"),
  cyberCat: document.querySelector("#cyberCat"),
  twinDriverLabel: document.querySelector("#twinDriverLabel"),
  centroidReadout: document.querySelector("#centroidReadout"),
  confidenceReadout: document.querySelector("#confidenceReadout"),
  subjectReadout: document.querySelector("#subjectReadout"),
  actionReadout: document.querySelector("#actionReadout"),
  activityValue: document.querySelector("#activityValue"),
  motionValue: document.querySelector("#motionValue"),
  motionHint: document.querySelector("#motionHint"),
  latencyValue: document.querySelector("#latencyValue"),
  qualityValue: document.querySelector("#qualityValue"),
  signalBars: [...document.querySelectorAll("#signalBars i")],
  activityChart: document.querySelector("#activityChart"),
  viewButtons: [...document.querySelectorAll("[data-view]")],
  poseButtons: [...document.querySelectorAll("[data-pose]")],
  pairDialog: document.querySelector("#pairDialog"),
  pairCloseButton: document.querySelector("#pairCloseButton"),
  pairCode: document.querySelector("#pairCode"),
  phoneUrl: document.querySelector("#phoneUrl"),
  certificateUrl: document.querySelector("#certificateUrl"),
  copyPhoneUrlButton: document.querySelector("#copyPhoneUrlButton"),
  pairStatus: document.querySelector("#pairStatus"),
  skinDialog: document.querySelector("#skinDialog"),
  skinCloseButton: document.querySelector("#skinCloseButton"),
  catPhotoInputs: [...document.querySelectorAll("[data-photo-view]")],
  skinUploadPreviews: {
    front: document.querySelector("#skinUploadFrontPreview"),
    side: document.querySelector("#skinUploadSidePreview"),
    back: document.querySelector("#skinUploadBackPreview"),
  },
  skinUploadLabels: {
    front: document.querySelector("#skinUploadFrontLabel"),
    side: document.querySelector("#skinUploadSideLabel"),
    back: document.querySelector("#skinUploadBackLabel"),
  },
  skinOptions: [...document.querySelectorAll("[data-skin]")],
  resetSkinButton: document.querySelector("#resetSkinButton"),
  applySkinButton: document.querySelector("#applySkinButton"),
  freeAdoptButton: document.querySelector("#freeAdoptButton"),
  customOrderButton: document.querySelector("#customOrderButton"),
  customLockedPanel: document.querySelector("#customLockedPanel"),
  skinUploadGrid: document.querySelector("#skinUploadGrid"),
  customIdentityField: document.querySelector("#customIdentityField"),
  customUserNameInput: document.querySelector("#customUserNameInput"),
  customUserNameHint: document.querySelector("#customUserNameHint"),
  paymentDialog: document.querySelector("#paymentDialog"),
  paymentCloseButton: document.querySelector("#paymentCloseButton"),
  paymentConfirmButton: document.querySelector("#paymentConfirmButton"),
  paymentOrderBox: document.querySelector("#paymentOrderBox"),
  paymentStatus: document.querySelector("#paymentStatus"),
  subBadge: document.querySelector("#subBadge"),
  upgradeButton: document.querySelector("#upgradeButton"),
  fusionStatus: document.querySelector("#fusionStatus"),
  toast: document.querySelector("#toast"),
};

const state = {
  mode: "idle",
  paused: false,
  connecting: false,
  startedAt: 0,
  motionCount: 0,
  activity: 0,
  animationFrame: null,
  metricTimer: null,
  currentAction: "idle",
  twinData: null,
  lastTwinUpdate: 0,
  trackerLatency: 0,
  lastDesktopPublishAt: 0,
  lastDesktopOpenAt: 0,
  desktopOpenInFlight: false,
  desktopPlatform: null,
  desktopTwinVisible: localStorage.getItem("neko.desktopTwin.visible") !== "false",
  desktopDisplayMode: localStorage.getItem("neko.desktopTwin.displayMode") || "live",
  skinDraft: {
    style: "original",
    texture: "",
    photos: {
      front: "",
      side: "",
      back: "",
    },
    primary: "#d6d7cd",
    secondary: "#777c73",
  },
  posePreviewTimer: null,
  posePreviewAction: null,
  nativeAnimations: {},
  subStatus: null,
  currentPaymentOrderId: localStorage.getItem("neko.customPayment.orderId") || "",
  paymentPollTimer: null,
  authUser: null,
  authMode: "register",
  authMethod: "nickname",
};

const DESKTOP_INSTALLERS = {
  mac: {
    url: "/dist/neko-sync-desktop-mac.zip",
    filename: "neko-sync-desktop-mac.zip",
    label: "macOS",
  },
  windows: {
    url: "/dist/neko-sync-desktop-windows.zip",
    filename: "neko-sync-desktop-windows.zip",
    label: "Windows",
  },
};
const DESKTOP_INSTALL_PROMPT_KEY = "neko.desktopInstaller.prompted";

const cameraProtocol = new CameraProtocol();
const motionTwin = new MotionTwinEngine();
const remoteCamera = new RemoteCameraReceiver();

const chartBars = Array.from({ length: 16 }, () => {
  const bar = document.createElement("i");
  bar.style.height = "2px";
  elements.activityChart.appendChild(bar);
  return bar;
});

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2600);
}

function getRequiredNativeAnimation(action) {
  return {
    walking: "walking",
    prowling: "walking",
    turning: "walking",
    running: "running",
    jumpStart: "jumpStart",
    jumping: "jumping",
    jumpFall: "jumpFall",
    jumpEnd: "jumpEnd",
  }[action] || "";
}

function configurePoseButtons(animations = {}, hasNativeModel = false) {
  state.nativeAnimations = animations || {};
  const semanticRigAvailable = Boolean(
    window.twin3D?.getDebugInfo?.()?.semanticRig
    || document.querySelector("#petStage, #desktopStage")?.dataset.semanticRig,
  );
  elements.poseButtons.forEach((button) => {
    const requiredAnimation = getRequiredNativeAnimation(button.dataset.pose);
    const available = (
      !hasNativeModel
      || !requiredAnimation
      || Boolean(animations[requiredAnimation])
      || semanticRigAvailable
    );
    button.disabled = !available;
    button.title = available
      ? hasNativeModel
        ? animations[requiredAnimation]
          ? "当前分身可用的原生骨骼动作"
          : "语义骨骼控制器驱动"
        : "赛博分段骨架动作"
      : "当前分身缺少这个原生动作";
  });
}

function whenTwin3D() {
  if (window.twin3D) {
    return Promise.resolve(window.twin3D);
  }
  return new Promise((resolve) => {
    window.addEventListener("twin3dready", () => resolve(window.twin3D), { once: true });
  });
}

function setFusionStatus(message, stateName = "") {
  elements.fusionStatus.className = `fusion-status${stateName ? ` is-${stateName}` : ""}`;
  elements.fusionStatus.querySelector("span").textContent = message;
}

function setStatus(label, active = false) {
  elements.cameraStatus.lastChild.textContent = label;
  elements.cameraStatus.classList.toggle("active", active);
}

function renderCameraDevices(devices) {
  const currentValue = elements.cameraDevice.value;
  elements.cameraDevice.innerHTML = "";

  const automaticOption = document.createElement("option");
  automaticOption.value = "";
  automaticOption.textContent = "自动选择摄像头";
  elements.cameraDevice.appendChild(automaticOption);

  devices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.id;
    option.textContent = device.label;
    elements.cameraDevice.appendChild(option);
  });

  const preferredValue = devices.some((device) => device.id === currentValue)
    ? currentValue
    : cameraProtocol.activeDeviceId;
  elements.cameraDevice.value = devices.some((device) => device.id === preferredValue)
    ? preferredValue
    : "";
}

async function refreshCameraDevices(requestPermission = false) {
  elements.refreshDevicesButton.disabled = true;
  elements.cameraDevice.disabled = true;

  try {
    const devices = requestPermission && !cameraProtocol.stream
      ? await cameraProtocol.requestPermission()
      : await cameraProtocol.listDevices();
    renderCameraDevices(devices);
    elements.protocolLabel.textContent = devices.length
      ? `MediaStream · 已发现 ${devices.length} 个视频输入`
      : requestPermission
        ? "MediaStream · 未发现视频输入"
        : "MediaStream · 点击刷新并授权以发现设备";
    return devices;
  } catch (error) {
    const protocolError = cameraProtocol.normalizeError(error);
    elements.protocolLabel.textContent = `${protocolError.code} · ${protocolError.message}`;
    showToast(protocolError.message);
    return [];
  } finally {
    elements.refreshDevicesButton.disabled = false;
    elements.cameraDevice.disabled = false;
  }
}

function setPetAction(action) {
  const labels = {
    idle: "观察中",
    tracking: "轻微活动",
    walking: "缓慢行走",
    running: "快速奔跑",
    prowling: "低姿潜行",
    turning: "巡视转身",
    jumpStart: "起跳准备",
    jumpFall: "空中下落",
    jumpEnd: "落地收势",
    alert: "抬头观察",
    lying: "收腿伏卧",
    jumping: "轻盈蹦跳",
  };
  const safeAction = labels[action] ? action : "idle";
  [...elements.cyberCat.classList]
    .filter((className) => className.startsWith("is-"))
    .forEach((className) => elements.cyberCat.classList.remove(className));
  elements.cyberCat.classList.add(`is-${safeAction}`);
  window.twin3D?.setAction(safeAction);
  elements.actionReadout.textContent = labels[safeAction];

  if (safeAction !== state.currentAction) {
    state.currentAction = safeAction;
    state.motionCount += 1;
    elements.motionValue.textContent = state.motionCount;
    elements.motionHint.textContent = `最近识别：${labels[safeAction]}`;
  }
}

function createDemoTwinData(time) {
  const phase = time / 1100;
  const elapsed = Math.max(0, time - state.startedAt);
  const actionPhase = Math.floor(elapsed / 3200) % 6;
  const action = [
    "idle",
    "walking",
    "running",
    "prowling",
    "turning",
    "alert",
  ][actionPhase];
  const isJumping = false;
  const isLying = false;
  return {
    timestamp: time,
    hasMotion: true,
    x: 0.5 + Math.sin(phase) * 0.2,
    y: isJumping ? 0.4 : isLying ? 0.64 : 0.55 + Math.cos(phase * 0.7) * 0.08,
    deltaX: Math.cos(phase) * 0.016,
    deltaY: -Math.sin(phase * 0.7) * 0.006,
    speed: action === "running" ? 0.78 : action === "walking" ? 0.48 : 0.12,
    intensity: action === "running" ? 0.82 : action === "walking" ? 0.52 : action === "alert" ? 0.3 : 0.13,
    confidence: 0.94,
    subjectState: "locked",
    calibrated: true,
    direction: Math.cos(phase) > 0 ? 1 : -1,
    action,
    bounds: {
      x: 0.31 + Math.sin(phase) * 0.1,
      y: 0.28,
      width: isLying ? 0.58 : 0.43,
      height: isLying ? 0.28 : 0.52,
    },
  };
}

function applyTwinData(data) {
  if (!data || state.paused) {
    return;
  }

  state.twinData = data;
  state.activity = Math.max(4, Math.round(data.intensity * 100));
  const displayX = state.mode === "camera" ? 1 - data.x : data.x;
  const displayDirection = state.mode === "camera" ? -data.direction : data.direction;
  const stageTravel = Math.max(36, elements.cyberCat.parentElement.clientWidth * 0.24);
  const offsetX = (displayX - 0.5) * stageTravel;
  const offsetY = Math.max(-18, Math.min(16, (data.y - 0.55) * 70));
  const turn = displayDirection * Math.min(14, 5 + data.speed * 12);
  const scale = 0.95 + Math.min(0.08, data.bounds.height * 0.08);

  elements.cyberCat.style.setProperty("--twin-x", `${offsetX.toFixed(1)}px`);
  elements.cyberCat.style.setProperty("--twin-y", `${offsetY.toFixed(1)}px`);
  elements.cyberCat.style.setProperty("--twin-turn", `${turn.toFixed(1)}deg`);
  elements.cyberCat.style.setProperty("--twin-scale", scale.toFixed(3));
  window.twin3D?.setMotion({
    x: displayX - 0.5,
    y: (data.y - 0.55) * -0.5,
    direction: displayDirection,
    speed: data.speed,
    intensity: data.intensity,
  });
  elements.centroidReadout.textContent = `${Math.round(displayX * 100)} / ${Math.round(data.y * 100)}`;
  elements.confidenceReadout.textContent = `${Math.round(data.confidence * 100)}%`;
  elements.subjectReadout.textContent = getSubjectLabel(data.subjectState);
  const displayAction = state.posePreviewAction || data.action;
  setPetAction(displayAction);
  publishDesktopTwin({
    ...data,
    action: displayAction,
  });
}

function publishDesktopTwin(data) {
  const now = performance.now();
  if (now - state.lastDesktopPublishAt < 100) {
    return;
  }
  state.lastDesktopPublishAt = now;
  fetch("/api/twin/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      visible: state.desktopTwinVisible,
      displayMode: data.displayMode || state.desktopDisplayMode,
      action: data.action,
      confidence: data.confidence,
      direction: data.direction,
      intensity: data.intensity,
      speed: data.speed,
    }),
    keepalive: true,
  }).catch(() => {
    // The standalone static preview does not expose the desktop relay API.
  });
}

function setDesktopDisplayMode(mode) {
  state.desktopDisplayMode = mode === "custom-pending" ? "custom-pending" : "live";
  localStorage.setItem("neko.desktopTwin.displayMode", state.desktopDisplayMode);
}

function publishCustomPendingDesktopTwin() {
  setDesktopDisplayMode("custom-pending");
  if (!state.desktopTwinVisible) {
    state.desktopTwinVisible = true;
    localStorage.setItem("neko.desktopTwin.visible", "true");
    renderDesktopTwinToggle();
  }
  state.lastDesktopPublishAt = 0;
  publishDesktopTwin({
    displayMode: "custom-pending",
    action: "jumping",
    confidence: 1,
    direction: 0,
    intensity: 0.72,
    speed: 0.58,
  });
  openDesktopTwinWindow();
}

function renderDesktopTwinToggle() {
  elements.desktopTwinButton?.classList.toggle("is-on", state.desktopTwinVisible);
  elements.desktopTwinButton?.setAttribute("aria-pressed", String(state.desktopTwinVisible));
  if (elements.desktopTwinButtonLabel) {
    elements.desktopTwinButtonLabel.textContent = state.desktopTwinVisible
      ? "桌面显示"
      : "桌面隐藏";
  }
}

function setDesktopTwinVisible(visible, announce = true, userInitiated = false) {
  state.desktopTwinVisible = Boolean(visible);
  localStorage.setItem("neko.desktopTwin.visible", String(state.desktopTwinVisible));
  renderDesktopTwinToggle();
  state.lastDesktopPublishAt = 0;
  publishDesktopTwin(state.twinData || {
    action: "idle",
    confidence: 0,
    direction: 0,
    intensity: 0,
    speed: 0,
  });
  if (state.desktopTwinVisible) {
    openDesktopTwinWindow({ browserFallback: userInitiated });
  }
  if (announce) {
    showToast(state.desktopTwinVisible ? "桌面数字分身已显示" : "桌面数字分身已隐藏");
  }
}

async function loadDesktopPlatform() {
  try {
    const response = await fetch("/api/desktop/platform", { cache: "no-store" });
    if (!response.ok) return null;
    state.desktopPlatform = await response.json();
    return state.desktopPlatform;
  } catch {
    return null;
  }
}

function openDesktopBrowserFallback(preopenedWindow = null) {
  preopenedWindow?.close?.();
  return promptDesktopInstaller(true);
}

async function createDesktopLink() {
  const response = await fetch("/api/desktop/link", { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "DESKTOP_LINK_FAILED");
    error.payload = payload;
    throw error;
  }
  return payload;
}

function isMacClient() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  return /mac/i.test(platform) || /Macintosh|Mac OS X/i.test(userAgent);
}

function isWindowsClient() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  return /win/i.test(platform) || /Windows/i.test(userAgent);
}

function getDesktopInstaller() {
  if (isMacClient()) return DESKTOP_INSTALLERS.mac;
  if (isWindowsClient()) return DESKTOP_INSTALLERS.windows;
  return null;
}

function downloadDesktopInstaller(installer) {
  const link = document.createElement("a");
  link.href = installer.url;
  link.download = installer.filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function promptDesktopInstaller(force = false) {
  const platform = state.desktopPlatform || await loadDesktopPlatform();
  if (platform?.desktopAvailable) {
    return false;
  }
  const installer = getDesktopInstaller();
  if (!installer) {
    showToast("真正置顶需要安装本机桌面组件；当前支持 macOS 和 Windows");
    return false;
  }
  const promptKey = `${DESKTOP_INSTALL_PROMPT_KEY}.${installer.label}`;
  if (!force && localStorage.getItem(promptKey) === "true") {
    return false;
  }
  localStorage.setItem(promptKey, "true");
  downloadDesktopInstaller(installer);
  showToast(`已下载 ${installer.label} 桌面组件，解压后打开即可置顶显示`);
  return true;
}

async function openDesktopTwinWindow(options = {}) {
  const now = Date.now();
  if (state.desktopOpenInFlight || now - state.lastDesktopOpenAt < 1800) {
    return;
  }
  if (!state.authUser) {
    showToast("请先登录账号，再把数字分身放到桌面");
    openAuthDialog("login");
    return;
  }
  const allowBrowserFallback = Boolean(options.browserFallback);
  state.desktopOpenInFlight = true;
  state.lastDesktopOpenAt = now;
  try {
    const link = await createDesktopLink();
    window.location.href = link.deepLink;
    showToast("正在唤起桌面数字分身");
    if (allowBrowserFallback) {
      window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          promptDesktopInstaller(true);
        }
      }, 1800);
    }
  } catch (error) {
    if (error.message === "AUTH_REQUIRED") {
      showToast("请先登录账号，再把数字分身放到桌面");
      openAuthDialog("login");
    } else {
      showToast("无法生成桌面同步链接");
    }
  } finally {
    state.desktopOpenInFlight = false;
  }
}

function getSubjectLabel(subjectState) {
  const labels = {
    calibrating: "校准中",
    searching: "搜索中",
    acquiring: "锁定中",
    locked: "已锁定",
    holding: "短暂丢失",
  };
  return labels[subjectState] || "等待";
}

function calibrateEnvironment() {
  if (!["camera", "remote"].includes(state.mode)) {
    showToast("请先连接摄像头");
    return;
  }

  motionTwin.calibrate();
  elements.calibrateButton.disabled = true;
  elements.calibrateButton.classList.add("is-calibrating");
  elements.subjectReadout.textContent = "校准中";
  setStatus("环境校准中", true);
  showToast("请保持镜头静止，并让宠物暂时离开画面");
}

function resizePoseCanvas() {
  const rect = elements.poseCanvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  elements.poseCanvas.width = Math.round(rect.width * ratio);
  elements.poseCanvas.height = Math.round(rect.height * ratio);
}

function getPosePoints(time, width, height) {
  const data = state.twinData || createDemoTwinData(time);
  const sourceX = state.mode === "camera" ? 1 - data.x : data.x;
  const bounds = data.bounds || { width: 0.44, height: 0.5 };
  const bodyWidth = Math.max(width * 0.22, bounds.width * width * 0.72);
  const bodyHeight = Math.max(height * 0.25, bounds.height * height * 0.72);
  const centerX = sourceX * width;
  const centerY = data.y * height;

  return {
    nose: [centerX - bodyWidth * 0.48, centerY - bodyHeight * 0.36],
    neck: [centerX - bodyWidth * 0.28, centerY - bodyHeight * 0.16],
    shoulder: [centerX - bodyWidth * 0.12, centerY - bodyHeight * 0.14],
    hip: [centerX + bodyWidth * 0.34, centerY],
    tail: [centerX + bodyWidth * 0.55, centerY - bodyHeight * 0.17],
    frontKnee: [centerX - bodyWidth * 0.14, centerY + bodyHeight * 0.27],
    frontPaw: [centerX - bodyWidth * 0.18, centerY + bodyHeight * 0.5],
    backKnee: [centerX + bodyWidth * 0.3, centerY + bodyHeight * 0.28],
    backPaw: [centerX + bodyWidth * 0.38, centerY + bodyHeight * 0.5],
  };
}

function drawPose(time) {
  const canvas = elements.poseCanvas;
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.width / ratio;
  const height = canvas.height / ratio;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  if (state.mode === "idle" || state.paused) {
    return;
  }

  const points = getPosePoints(time, width, height);
  const links = [
    ["nose", "neck"],
    ["neck", "shoulder"],
    ["shoulder", "hip"],
    ["hip", "tail"],
    ["shoulder", "frontKnee"],
    ["frontKnee", "frontPaw"],
    ["hip", "backKnee"],
    ["backKnee", "backPaw"],
  ];

  context.lineWidth = 1.2;
  context.strokeStyle = "rgba(201, 255, 56, 0.86)";
  context.shadowColor = "rgba(201, 255, 56, 0.45)";
  context.shadowBlur = 7;

  links.forEach(([from, to]) => {
    context.beginPath();
    context.moveTo(...points[from]);
    context.lineTo(...points[to]);
    context.stroke();
  });

  Object.values(points).forEach(([x, y], index) => {
    context.beginPath();
    context.arc(x, y, index === 0 ? 4.5 : 3, 0, Math.PI * 2);
    context.fillStyle = index === 0 ? "#c9ff38" : "#efffd0";
    context.fill();
  });

  context.shadowBlur = 0;
  const data = state.twinData || createDemoTwinData(time);
  const bounds = data.bounds;
  const boxX = (state.mode === "camera" ? 1 - bounds.x - bounds.width : bounds.x) * width;
  const boxY = bounds.y * height;
  const boxWidth = bounds.width * width;
  const boxHeight = bounds.height * height;
  context.strokeStyle = "rgba(201, 255, 56, 0.65)";
  context.strokeRect(boxX, boxY, boxWidth, boxHeight);

  context.fillStyle = "rgba(25, 27, 24, 0.78)";
  context.fillRect(boxX, Math.max(0, boxY - 18), 104, 18);
  context.fillStyle = "#c9ff38";
  context.font = "9px monospace";
  context.fillText(
    `MOTION ${Math.round(data.confidence * 100)}%`,
    boxX + 8,
    Math.max(12, boxY - 6),
  );
}

function animationLoop(time) {
  if (!state.paused && state.mode === "demo" && time - state.lastTwinUpdate > 80) {
    state.lastTwinUpdate = time;
    applyTwinData(createDemoTwinData(time));
  }

  drawPose(time);
  state.animationFrame = window.requestAnimationFrame(animationLoop);
}

function updateMetrics() {
  if (state.mode === "idle" || state.paused) {
    return;
  }

  const activityRounded = Math.round(state.activity);
  const latency = ["camera", "remote"].includes(state.mode)
    ? Math.round(state.trackerLatency || 84)
    : 72;
  const quality = Math.round((state.twinData?.confidence || 0.9) * 100);

  elements.activityValue.textContent = activityRounded;
  elements.latencyValue.textContent = latency;
  elements.qualityValue.textContent = `${quality}%`;

  const activeBars = Math.max(1, Math.round(quality / 20));
  elements.signalBars.forEach((bar, index) => {
    bar.classList.toggle("active", index < activeBars);
  });

  const oldestBar = chartBars.shift();
  oldestBar.remove();
  const newBar = document.createElement("i");
  newBar.style.height = `${Math.max(3, activityRounded * 0.28)}px`;
  elements.activityChart.appendChild(newBar);
  chartBars.push(newBar);
}

function startExperience(mode) {
  state.mode = mode;
  state.paused = false;
  state.startedAt = performance.now();
  state.activity = ["camera", "remote"].includes(mode) ? 42 : 36;
  state.motionCount = 0;
  state.twinData = null;
  state.lastTwinUpdate = 0;
  elements.subjectReadout.textContent = ["camera", "remote"].includes(mode) ? "搜索中" : "已锁定";
  elements.calibrateButton.disabled = !["camera", "remote"].includes(mode);
  elements.calibrateButton.classList.remove("is-calibrating");

  elements.cameraPlaceholder.classList.add("hidden");
  elements.pauseButton.disabled = false;
  elements.pauseButton.innerHTML = "<span></span>暂停同步";
  const statusLabels = {
    camera: "正在追踪",
    remote: "手机已连接",
    demo: "演示追踪",
  };
  setStatus(statusLabels[mode] || "等待连接", true);
  setPetAction("idle");
  elements.twinDriverLabel.textContent = mode === "remote"
    ? "TWIN // MOBILE WEBRTC"
    : mode === "camera"
      ? "TWIN // MOTION VISION"
      : "TWIN // SYNTHETIC DEMO";

  window.clearInterval(state.metricTimer);
  state.metricTimer = window.setInterval(updateMetrics, 1200);
  updateMetrics();
}

async function startCamera() {
  if (state.connecting) {
    return;
  }

  if (!cameraProtocol.supported) {
    setStatus("协议不支持");
    elements.protocolLabel.textContent = "UNSUPPORTED · 当前浏览器不支持 MediaStream";
    showToast("当前浏览器不支持摄像头协议，请使用最新版 Chrome、Edge 或 Safari");
    return;
  }

  state.connecting = true;
  elements.cameraButton.disabled = true;
  elements.cameraButtonLabel.textContent = "正在连接";

  try {
    remoteCamera.stop();
    setStatus("正在请求权限");
    const { stream, metadata } = await cameraProtocol.connect({
      deviceId: elements.cameraDevice.value || null,
      width: 1280,
      height: 720,
      frameRate: 30,
    });

    elements.cameraFeed.srcObject = stream;
    elements.cameraFeed.classList.remove("no-mirror");
    await elements.cameraFeed.play();
    elements.cameraFeed.classList.add("active");
    elements.resolutionLabel.textContent = `CAM ${metadata.width} × ${metadata.height}`;
    elements.cameraButtonLabel.textContent = "摄像头已连接";
    elements.protocolLabel.textContent = [
      "MediaStream",
      metadata.label,
      metadata.frameRate ? `${metadata.frameRate} FPS` : null,
    ].filter(Boolean).join(" · ");
    startExperience("camera");
    motionTwin.start(elements.cameraFeed);
    await refreshCameraDevices();
    showToast("数字分身已连接摄像头运动数据");
  } catch (error) {
    const protocolError = cameraProtocol.normalizeError(error);
    setStatus("连接失败");
    elements.cameraButtonLabel.textContent = "重新连接";
    elements.protocolLabel.textContent = `${protocolError.code} · ${protocolError.message}`;
    showToast(protocolError.message);
  } finally {
    state.connecting = false;
    elements.cameraButton.disabled = false;
  }
}

function startDemo() {
  motionTwin.stop();
  remoteCamera.stop();
  cameraProtocol.stop();
  elements.cameraFeed.srcObject = null;
  elements.cameraFeed.classList.remove("active");
  elements.cameraFeed.classList.remove("no-mirror");
  elements.resolutionLabel.textContent = "DEMO FEED 01";
  elements.cameraButtonLabel.textContent = "开启摄像头";
  elements.calibrateButton.disabled = true;
  elements.calibrateButton.classList.remove("is-calibrating");
  elements.protocolLabel.textContent = "DEMO · 模拟姿态数据";
  startExperience("demo");
  showToast("演示模式已开启：正在播放模拟姿态数据");
}

function createPairCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => (
    alphabet[Math.floor(Math.random() * alphabet.length)]
  )).join("");
}

async function startRemoteCamera() {
  if (!window.RTCPeerConnection) {
    showToast("当前浏览器不支持 WebRTC");
    return;
  }
  if (!window.isSecureContext) {
    showToast("手机摄像头接入需要 HTTPS，请使用安全服务启动项目");
    return;
  }

  motionTwin.stop();
  cameraProtocol.stop();
  elements.cameraFeed.srcObject = null;
  elements.cameraFeed.classList.remove("active");
  elements.cameraFeed.classList.add("no-mirror");
  const roomId = createPairCode();
  elements.pairCode.textContent = roomId;
  elements.pairStatus.textContent = "等待手机输入配对码";
  elements.phoneUrl.value = `${location.origin}/sender.html?room=${roomId}`;
  elements.certificateUrl.value = "请通过安全服务启动以获取";

  try {
    const response = await fetch("/api/info", { cache: "no-store" });
    if (response.ok) {
      const info = await response.json();
      if (info.lanUrls?.[0]) {
        elements.phoneUrl.value = `${info.lanUrls[0]}/sender.html?room=${roomId}`;
      }
      if (info.certificateUrls?.[0]) {
        elements.certificateUrl.value = info.certificateUrls[0];
      }
    }
  } catch {
    // Static-only preview can still show the current-origin URL.
  }

  if (typeof elements.pairDialog.showModal === "function") {
    elements.pairDialog.showModal();
  } else {
    elements.pairDialog.setAttribute("open", "");
  }

  setStatus("等待手机");
  elements.protocolLabel.textContent = `WebRTC · 配对码 ${roomId}`;
  try {
    await remoteCamera.start(roomId);
  } catch (error) {
    elements.pairStatus.textContent = "创建会话失败";
    showToast(error.message || "远程摄像头会话创建失败");
  }
}

const skinLabels = {
  original: "原生赛博",
  soft: "照片柔融",
  pixel: "像素拼贴",
  neon: "霓虹热成像",
  mono: "黑白蚀刻",
};

function applySkinToElement(element, appearance) {
  const style = skinLabels[appearance?.style] ? appearance.style : "original";
  [...element.classList]
    .filter((className) => (
      className.startsWith("skin-") || className.startsWith("texture-")
    ))
    .forEach((className) => element.classList.remove(className));
  element.classList.add(`skin-${style}`);
  if (appearance?.texture) {
    element.classList.add(
      appearance.layout === "identity-atlas-v1" ? "texture-atlas" : "texture-photo",
    );
  }
  element.style.setProperty(
    "--pet-texture",
    appearance?.texture ? `url("${appearance.texture}")` : "none",
  );
  element.style.setProperty("--pet-primary", appearance?.primary || "#d6d7cd");
  element.style.setProperty("--pet-secondary", appearance?.secondary || "#777c73");
  window.twin3D?.setIdentityPalette?.(
    appearance?.primary || "#c9ff38",
    appearance?.secondary || "#7de7ff",
  );
}

function selectSkinStyle(style) {
  state.skinDraft.style = skinLabels[style] ? style : "original";
  elements.skinOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.skin === state.skinDraft.style);
  });
  applySkinToElement(elements.cyberCat, state.skinDraft);
}

async function activateSkinPreset(button) {
  const style = button.dataset.skin;
  if (style !== "original" && !state.skinDraft.texture) {
    state.skinDraft.style = style;
    elements.skinOptions.forEach((option) => {
      option.classList.toggle("active", option.dataset.skin === style);
    });
    elements.skinControlHint.textContent = `“${skinLabels[style]}”需要先上传一张猫咪照片。`;
    elements.skinDialog.showModal();
    return;
  }
  selectSkinStyle(style);
  await saveSkin(state.skinDraft);
  elements.skinControlHint.textContent = `当前使用：${skinLabels[style]}。点击其他样式可即时切换。`;
  showToast(`数字分身已切换为${skinLabels[style]}`);
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

async function createPhotoTexture(file) {
  const bitmap = await createImageBitmap(file);
  const maxSize = 1024;
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = width;
  canvas.height = height;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const pixels = context.getImageData(0, 0, width, height).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let samples = 0;
  for (let index = 0; index < pixels.length; index += 64) {
    red += pixels[index];
    green += pixels[index + 1];
    blue += pixels[index + 2];
    samples += 1;
  }
  const primary = rgbToHex(red / samples, green / samples, blue / samples);
  const secondary = rgbToHex(
    (red / samples) * 0.52,
    (green / samples) * 0.52,
    (blue / samples) * 0.52,
  );
  return {
    texture: canvas.toDataURL("image/jpeg", 0.86),
    primary,
    secondary,
  };
}

async function handleCatPhoto(event) {
  if (!hasCustomAccess()) {
    event.target.value = "";
    showPaymentDialog();
    showToast("请先开通定制版");
    return;
  }
  const [file] = event.target.files;
  const view = event.target.dataset.photoView;
  if (!file) {
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    showToast("照片不能超过 15 MB");
    return;
  }
  try {
    elements.skinUploadLabels[view].textContent = "正在处理照片";
    const photo = await createPhotoTexture(file);
    state.skinDraft.photos[view] = photo.texture;
    if (view === "front") {
      Object.assign(state.skinDraft, photo);
    }
    if (state.skinDraft.style === "original") {
      state.skinDraft.style = "soft";
    }
    elements.skinUploadPreviews[view].textContent = "";
    elements.skinUploadPreviews[view].style.backgroundImage = `url("${photo.texture}")`;
    elements.skinUploadLabels[view].textContent = file.name;
    selectSkinStyle(state.skinDraft.style);
    const readyCount = Object.values(state.skinDraft.photos).filter(Boolean).length;
    setFusionStatus(
      readyCount >= 1
        ? `已准备 ${readyCount} 张身份参考，可提交今日限量预约`
        : "等待身份照片",
      readyCount >= 1 ? "ready" : "working",
    );
    const viewName = { front: "正面", side: "侧面", back: "背面" }[view];
    showToast(`${viewName}照片已读取`);
  } catch {
    elements.skinUploadLabels[view].textContent = {
      front: "参考照片 1",
      side: "参考照片 2",
      back: "参考照片 3",
    }[view];
    showToast("无法读取这张照片，请换一张试试");
  }
}

async function saveSkin(appearance) {
  localStorage.setItem("neko-sync-appearance", JSON.stringify(appearance));
  try {
    await fetch("/api/twin/appearance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(appearance),
    });
  } catch {
    // Static preview still keeps the selected skin in this browser.
  }
}

async function checkFusionAvailability() {
  try {
    const response = await fetch("/api/twin/3d", { cache: "no-store" });
    const payload = await response.json();
    const reservation = payload.reservation;
    if (reservation?.available) {
      setFusionStatus(
        `今日数字分身预约剩余 ${reservation.remaining} / ${reservation.limit} 位`,
        "ready",
      );
    } else if (reservation) {
      setFusionStatus("今日数字分身预约已满，请明天再提交", "error");
    } else {
      setFusionStatus("数字分身预约通道准备中", "working");
    }
    if (payload.myReservation) {
      const reviewNote = payload.myReservation.payment?.reviewNote || "";
      if (payload.myReservation.status === "payment_rejected") {
        setFusionStatus(
          `付款核对未通过：${reviewNote || "请检查付款金额或重新付款后联系后台"}`,
          "error",
        );
      } else if (payload.myReservation.status === "payment_review") {
        setFusionStatus(`预约 ${payload.myReservation.id} 已提交，等待后台核对付款`, "working");
      } else if (payload.myReservation.status === "reserved") {
        setFusionStatus(`预约 ${payload.myReservation.id} 已通过付款核对，等待制作`, "ready");
        elements.skinControlHint.textContent = `专属定制分身 ${payload.myReservation.id} 已进入制作队列，完成后会替换当前粒子猫。`;
      }
    }
    if (payload.modelUrl) {
      const twin3D = await whenTwin3D();
      await twin3D.loadModel(payload.modelUrl, payload.animations);
      const hasAnimations = Object.values(payload.animations || {}).some(Boolean);
      configurePoseButtons(payload.animations, true);
      elements.catSkinButtonLabel.textContent = "预约数字分身";
      elements.skinControlHint.textContent = payload.warning
        ? payload.warning
        : hasAnimations
        ? "猫猫四足骨骼 · 原生动画驱动"
        : "你的专属定制虚拟分身已加载。";
    }
  } catch {
    setFusionStatus("无法连接数字分身预约服务", "error");
  }
}

async function pollTwin3DJob(jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30 * 60 * 1000) {
    await new Promise((resolve) => window.setTimeout(resolve, 5000));
    const response = await fetch(`/api/twin/3d/jobs/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "TRIPO_QUERY_FAILED");
    }
    if (payload.status === "failed") {
      throw new Error(payload.error || "TRIPO_GENERATION_FAILED");
    }
    if (payload.modelUrl) {
      return payload;
    }
    const stageLabels = {
      generation: "正在生成三维猫咪",
      rigcheck: "正在验证四足骨骼兼容性",
      retopology: "正在重拓扑以避免动作变形",
      rigging: "正在生成四足骨骼与蒙皮",
      animation: "正在生成四足骨骼行走并校准动作混合",
    };
    const elapsedMinutes = Math.max(1, Math.ceil((Date.now() - startedAt) / 60000));
    setFusionStatus(
      `${stageLabels[payload.stage] || "Tripo 正在处理"} · 已等待 ${elapsedMinutes} 分钟`,
      "working",
    );
  }
  throw new Error("TRIPO_TIMEOUT");
}

async function applySkin() {
  if (!state.authUser) {
    openAuthDialog("register");
    showToast("请先注册或登录后再提交定制照片");
    return;
  }
  if (!hasCustomAccess()) {
    showPaymentDialog();
    showToast("请先生成付款订单并扫码支付 18.8 元");
    return;
  }
  const registeredName = getRegisteredUserName();
  const submittedName = elements.customUserNameInput?.value.trim() || "";
  if (!submittedName) {
    showToast("请填写和注册昵称一致的用户名称");
    elements.customUserNameInput?.focus();
    return;
  }
  if (normalizeUserName(submittedName) !== normalizeUserName(registeredName)) {
    showToast(`用户名称需要和注册昵称一致：${registeredName}`);
    elements.customUserNameInput?.focus();
    return;
  }
  const referenceCount = Object.values(state.skinDraft.photos).filter(Boolean).length;
  if (!referenceCount) {
    showToast("请先上传至少一张猫咪照片");
    return;
  }
  elements.applySkinButton.disabled = true;
  elements.applySkinButton.textContent = "正在提交预约";
  setFusionStatus("正在提交数字分身预约并保存身份照片", "working");
  try {
    const response = await fetch("/api/twin/3d/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: state.skinDraft.photos,
        customerName: submittedName,
        orderId: state.currentPaymentOrderId,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "RESERVATION_SUBMIT_FAILED");
    }
    applySkinToElement(elements.cyberCat, state.skinDraft);
    elements.catSkinButtonLabel.textContent = "预约数字分身";
    elements.skinControlHint.textContent = `预约号 ${payload.id} 已创建，后台核对付款后会安排建模与绑骨。`;
    setFusionStatus(
      payload.status === "reserved"
        ? `预约成功：${payload.id} · 今日剩余 ${payload.availability.remaining} 位`
        : `已提交付款核对：${payload.id} · 今日剩余 ${payload.availability.remaining} 位`,
      "ready",
    );
    publishCustomPendingDesktopTwin();
    elements.skinDialog.close();
    showToast(`数字分身资料已提交：${payload.id}，等待后台核对付款`);
  } catch (error) {
    const message = [
      "RESERVATION_IMAGE_REQUIRED",
      "INVALID_RESERVATION_IMAGE",
      "INVALID_RESERVATION_IMAGE_SIZE",
    ].includes(error.message)
      ? "请上传有效的猫咪身份照片"
      : error.message === "DAILY_RESERVATION_LIMIT_REACHED"
      ? "今日 20 个数字分身预约名额已满"
      : error.message === "USER_NAME_MISMATCH"
      ? "用户名称需要和注册昵称一致"
      : error.message === "PAYMENT_ORDER_REQUIRED"
      ? "请先生成付款订单并扫码支付"
      : `预约失败：${error.message}`;
    applySkinToElement(elements.cyberCat, state.skinDraft);
    setFusionStatus(message, "error");
    showToast(message);
  } finally {
    elements.applySkinButton.disabled = false;
    elements.applySkinButton.textContent = "提交预约";
  }
}

function resetSkin() {
  state.skinDraft = {
    style: "original",
    texture: "",
    photos: {
      front: "",
      side: "",
      back: "",
    },
    layout: "",
    primary: "#d6d7cd",
    secondary: "#777c73",
  };
  elements.catPhotoInputs.forEach((input) => {
    input.value = "";
  });
  Object.entries(elements.skinUploadPreviews).forEach(([view, preview]) => {
    preview.textContent = "+";
      preview.style.backgroundImage = "";
      elements.skinUploadLabels[view].textContent = {
      front: "参考照片 1",
      side: "参考照片 2",
      back: "参考照片 3",
    }[view];
  });
  setFusionStatus("等待猫咪身份参考照片");
  elements.catSkinButtonLabel.textContent = "创建身份分身";
  elements.skinControlHint.textContent = "默认显示粒子科技虚拟猫；提交定制后会更新为你的专属猫咪分身。";
  window.twin3D?.clearModel();
  fetch("/api/twin/3d", { method: "DELETE" }).catch(() => {});
  selectSkinStyle("original");
}

async function loadSavedSkin() {
  let appearance = null;
  try {
    const response = await fetch("/api/twin/appearance", { cache: "no-store" });
    if (response.ok) {
      appearance = await response.json();
    }
  } catch {
    // Use the local copy when the relay service is unavailable.
  }
  if (!appearance?.style) {
    try {
      appearance = JSON.parse(localStorage.getItem("neko-sync-appearance"));
    } catch {
      appearance = null;
    }
  }
  if (appearance?.style) {
    state.skinDraft = {
      ...appearance,
      photos: {
        front: "",
        side: "",
        back: "",
      },
    };
    applySkinToElement(elements.cyberCat, appearance);
    if (appearance.texture) {
      elements.catSkinButtonLabel.textContent = "预约数字分身";
      elements.skinControlHint.textContent = (
        `当前使用：${skinLabels[appearance.style]}。可上传照片提交专属定制分身预约。`
      );
    }
    selectSkinStyle(appearance.style);
  }
}

function togglePause() {
  if (state.mode === "idle") {
    return;
  }

  state.paused = !state.paused;
  elements.pauseButton.innerHTML = state.paused
    ? "<span></span>继续同步"
    : "<span></span>暂停同步";
  const resumeStatus = state.mode === "remote"
    ? "手机已连接"
    : state.mode === "camera"
      ? "正在追踪"
      : "演示追踪";
  setStatus(state.paused ? "同步暂停" : resumeStatus, !state.paused);
  if (state.paused) {
    elements.cyberCat.classList.remove(
      "is-tracking",
      "is-walking",
      "is-alert",
      "is-lying",
      "is-jumping",
    );
    elements.cyberCat.classList.add("is-idle");
    elements.actionReadout.textContent = "同步暂停";
  } else if (state.twinData) {
    applyTwinData(state.twinData);
  }
  showToast(state.paused ? "同步已暂停" : "同步已继续");
}

function setView(view, button) {
  const rotations = {
    "-1": "-20deg",
    "0": "0deg",
    "1": "20deg",
  };

  elements.cyberCat.style.setProperty("--view-turn", rotations[view]);
  window.twin3D?.setView(view);
  elements.viewButtons.forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
}

function previewPetPose(action, button) {
  if (button.disabled) {
    showToast("当前分身缺少这个原生动作");
    return;
  }
  window.clearTimeout(state.posePreviewTimer);
  state.posePreviewAction = action;
  elements.poseButtons.forEach((item) => item.classList.toggle("active", item === button));
  setPetAction(action);
  publishDesktopTwin({
    action,
    confidence: 1,
    direction: 0,
    intensity: action === "running" ? 0.82 : action === "walking" ? 0.48 : 0.18,
    speed: action === "running" ? 0.82 : action === "walking" ? 0.48 : 0.12,
  });
  state.posePreviewTimer = window.setTimeout(() => {
    state.posePreviewAction = null;
    elements.poseButtons.forEach((item) => item.classList.remove("active"));
    const nextAction = state.twinData?.action || "idle";
    setPetAction(nextAction);
    publishDesktopTwin(state.twinData || {
      action: "idle",
      confidence: 0,
      direction: 0,
      intensity: 0,
      speed: 0,
    });
  }, ["jumpStart", "jumpFall", "jumpEnd", "jumping", "turning"].includes(action) ? 3200 : 8000);
}

elements.cameraButton.addEventListener("click", startCamera);
elements.refreshDevicesButton.addEventListener("click", () => refreshCameraDevices(true));
elements.calibrateButton.addEventListener("click", calibrateEnvironment);
elements.remoteCameraButton.addEventListener("click", startRemoteCamera);
elements.desktopTwinButton?.addEventListener("click", () => {
  setDesktopTwinVisible(!state.desktopTwinVisible, true, true);
});
elements.catSkinButton.addEventListener("click", () => {
  elements.skinDialog.showModal();
  checkFusionAvailability();
});
elements.cameraDevice.addEventListener("change", () => {
  if (state.mode === "camera") {
    startCamera();
  }
});
elements.demoButton.addEventListener("click", startDemo);
elements.pairCloseButton.addEventListener("click", () => elements.pairDialog.close());
elements.copyPhoneUrlButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(elements.phoneUrl.value);
    showToast("手机访问地址已复制");
  } catch {
    elements.phoneUrl.select();
    showToast("无法自动复制，地址已选中");
  }
});
elements.skinCloseButton.addEventListener("click", () => elements.skinDialog.close());
elements.catPhotoInputs.forEach((input) => {
  input.addEventListener("change", handleCatPhoto);
});
elements.skinOptions.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.closest(".twin-skin-presets")) {
      activateSkinPreset(button);
    } else {
      selectSkinStyle(button.dataset.skin);
    }
  });
});
elements.resetSkinButton.addEventListener("click", resetSkin);
elements.applySkinButton.addEventListener("click", applySkin);
elements.pauseButton.addEventListener("click", togglePause);
elements.soundButton.addEventListener("click", () => {
  elements.soundButton.classList.toggle("is-muted");
  const isMuted = elements.soundButton.classList.contains("is-muted");
  showToast(isMuted ? "界面提示音已关闭" : "界面提示音已开启");
});
elements.viewButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view, button));
});
elements.poseButtons.forEach((button) => {
  button.addEventListener("click", () => previewPetPose(button.dataset.pose, button));
});

function updateAuthUI() {
  if (state.authUser) {
    const u = state.authUser;
    elements.accountChip.textContent = u.nickname || u.wechatNickname || u.phone || u.email || "已登录";
    elements.loginButton.hidden = true;
    elements.registerButton.hidden = true;
    elements.logoutButton.hidden = false;
    updateSubBadge();
  } else {
    elements.accountChip.textContent = "未登录";
    elements.loginButton.hidden = false;
    elements.registerButton.hidden = false;
    elements.logoutButton.hidden = true;
    elements.subBadge.hidden = true;
    elements.upgradeButton.hidden = true;
  }
  renderCustomAccess();
}

async function fetchSubStatus() {
  try {
    const r = await fetch("/api/subscription/status", { cache: "no-store" });
    if (r.ok) {
      state.subStatus = await r.json();
      if (state.subStatus.plan === "custom_pending") {
        localStorage.removeItem("neko.customPayment.orderId");
        state.currentPaymentOrderId = "";
        setDesktopDisplayMode("custom-pending");
        if (state.desktopTwinVisible) {
          state.lastDesktopPublishAt = 0;
          publishDesktopTwin({
            displayMode: "custom-pending",
            action: "jumping",
            confidence: 1,
            direction: 0,
            intensity: 0.72,
            speed: 0.58,
          });
        }
      } else if (state.subStatus.plan === "custom_paid") {
        localStorage.removeItem("neko.customPayment.orderId");
        state.currentPaymentOrderId = "";
      } else {
        setDesktopDisplayMode("live");
      }
      updateSubBadge();
      renderCustomAccess();
    }
  } catch {}
}

function updateSubBadge() {
  if (!state.subStatus) return;
  const { plan, chatQuota } = state.subStatus;
  elements.subBadge.hidden = false;
  if (plan === "custom_paid") {
    elements.subBadge.textContent = "定制版 · 已开通";
    elements.subBadge.className = "sub-badge premium";
    elements.upgradeButton.hidden = false;
  } else if (plan === "custom_pending") {
    elements.subBadge.textContent = "定制中 · 等待建模";
    elements.subBadge.className = "sub-badge premium";
    elements.upgradeButton.hidden = false;
  } else {
    const r = chatQuota?.remaining ?? 0;
    elements.subBadge.textContent = `免费对话 ${r}/${chatQuota?.limit || DAILY_CHAT_LIMIT_FREE}`;
    elements.subBadge.className = r === 0 ? "sub-badge exhausted" : "sub-badge free";
    elements.upgradeButton.hidden = false;
  }
  elements.upgradeButton.textContent = "无限对话待上线";
  elements.upgradeButton.classList.add("is-disabled");
  elements.upgradeButton.setAttribute("aria-disabled", "true");
}

const DAILY_CHAT_LIMIT_FREE = 5; // keep in sync with server

function getRegisteredUserName() {
  const user = state.authUser || {};
  return user.nickname || user.wechatNickname || user.phone || user.email || "";
}

function normalizeUserName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function hasConfirmedCustomPlan() {
  const plan = state.subStatus?.plan || state.authUser?.plan || "none";
  return plan === "custom_pending" || plan === "custom_paid";
}

function hasCustomAccess() {
  return hasConfirmedCustomPlan() || Boolean(state.currentPaymentOrderId);
}

function renderCustomAccess() {
  const unlocked = hasCustomAccess();
  elements.skinUploadGrid?.classList.toggle("is-locked", !unlocked);
  elements.customIdentityField?.classList.toggle("is-locked", !unlocked);
  if (elements.customLockedPanel) {
    elements.customLockedPanel.hidden = unlocked;
    if (!unlocked) {
      elements.customLockedPanel.querySelector("span").textContent = "请先生成 18.8 元付款订单并扫码付款，之后即可上传猫咪照片提交后台核对。";
    }
  }
  elements.catPhotoInputs.forEach((input) => {
    input.disabled = !unlocked;
  });
  if (elements.customUserNameInput) {
    const registeredName = getRegisteredUserName();
    elements.customUserNameInput.disabled = !unlocked;
    if (registeredName && !elements.customUserNameInput.value) {
      elements.customUserNameInput.value = registeredName;
    }
  }
  if (elements.customUserNameHint) {
    const registeredName = getRegisteredUserName();
    elements.customUserNameHint.textContent = registeredName
      ? `需要和注册昵称一致：${registeredName}`
      : "提交前请填写你的注册昵称，后台会按这个名称核对付款。";
  }
  elements.applySkinButton.disabled = !unlocked;
  elements.customOrderButton.textContent = unlocked
    ? state.currentPaymentOrderId && !hasConfirmedCustomPlan()
      ? "订单已生成 · 可提交照片"
      : "定制版已开通"
    : "开通定制版 · ¥18.8";
  elements.customOrderButton.disabled = false;
  if (!unlocked) {
    setFusionStatus("请先生成付款订单并扫码支付 18.8 元，再上传身份照片", "working");
  }
}

function openAuthDialog(mode, method) {
  state.authMode = mode;
  if (["nickname", "phone", "wechat"].includes(method)) {
    state.authMethod = method;
  } else if (!["nickname", "phone", "wechat"].includes(state.authMethod)) {
    state.authMethod = "nickname";
  }
  // Clear all inputs
  elements.authNicknameInput.value = "";
  if (elements.authEmailInput) elements.authEmailInput.value = "";
  elements.authPasswordInput.value = "";
  elements.authPasswordConfirmInput.value = "";
  elements.authPhoneInput.value = "";
  elements.authCodeInput.value = "";
  elements.authPhonePasswordInput.value = "验证码登录，无需密码";
  elements.authStatus.querySelector("span").textContent = "输入昵称和密码";
  elements.authSendCodeBtn.disabled = false;
  elements.authSendCodeBtn.textContent = "发送验证码";
  // Mode tabs
  if (mode === "register") {
    elements.authRegisterTab.classList.add("active");
    elements.authLoginTab.classList.remove("active");
    elements.authTitle.textContent = "注册账号";
    elements.authSubmitButton.textContent = "注册并登录";
  } else {
    elements.authLoginTab.classList.add("active");
    elements.authRegisterTab.classList.remove("active");
    elements.authTitle.textContent = "登录账号";
    elements.authSubmitButton.textContent = "登录";
  }
  // Method tabs
  renderAuthMethod();
  if (typeof elements.authDialog.showModal === "function") {
    elements.authDialog.showModal();
  } else {
    elements.authDialog.setAttribute("open", "");
  }
}

function renderAuthMethod() {
  const method = state.authMethod;
  elements.authMethodTabs.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.method === method);
  });
  elements.authFieldsEmail.hidden = method !== "nickname" && method !== "email";
  elements.authFieldsPhone.hidden = method !== "phone";
  elements.authFieldsWechat.hidden = method !== "wechat";
  elements.authSubmitButton.hidden = method === "wechat";
  elements.authPasswordConfirmField.hidden = state.authMode !== "register";
  elements.authPasswordInput.autocomplete = state.authMode === "register"
    ? "new-password"
    : "current-password";
  elements.authStatus.querySelector("span").textContent = method === "nickname"
    ? state.authMode === "register"
      ? "给猫咪起名并设置密码"
      : "输入昵称和密码"
    : method === "phone"
    ? "输入手机号并获取验证码"
    : "使用微信扫码完成登录";
  if (method === "wechat") {
    loadWechatQr();
  }
}

async function loadWechatQr() {
  try {
    const r = await fetch("/api/auth/wechat/qr", { cache: "no-store" });
    const data = await r.json();
    if (data.available) {
      elements.authWechatQr.innerHTML = `
        <p class="auth-wechat-hint">使用微信扫描二维码登录</p>
        <img class="auth-wechat-qr-img" src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data.qrUrl)}" alt="微信扫码登录" />
        <small>扫描后自动注册或登录</small>`;
    } else {
      elements.authWechatQr.innerHTML = '<p class="auth-wechat-pending">微信登录需要在 .env.local 中配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET</p>';
    }
  } catch {
    elements.authWechatQr.innerHTML = '<p class="auth-wechat-pending">无法加载微信登录</p>';
  }
}

async function submitAuth() {
  const method = state.authMethod;
  if (method === "nickname") {
    await submitNicknameAuth();
  } else if (method === "phone") {
    await submitPhoneAuth();
  }
}

function validateRegistrationPassword(password, identity = "") {
  const value = String(password || "");
  if (value.length < 8) {
    return "密码至少需要 8 位";
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return "密码需要同时包含字母和数字";
  }
  if (normalizeUserName(value) === normalizeUserName(identity)) {
    return "密码不能和账号名称相同";
  }
  return "";
}

async function submitNicknameAuth() {
  const nickname = elements.authNicknameInput.value.trim();
  const password = elements.authPasswordInput.value;
  const confirmPassword = elements.authPasswordConfirmInput.value;
  if (!nickname || nickname.length < 2 || nickname.length > 18) {
    elements.authStatus.querySelector("span").textContent = "昵称需要 2 到 18 个字符";
    return;
  }
  if (!password) {
    elements.authStatus.querySelector("span").textContent = "请输入密码";
    return;
  }
  if (state.authMode === "register") {
    const passwordError = validateRegistrationPassword(password, nickname);
    if (passwordError) {
      elements.authStatus.querySelector("span").textContent = passwordError;
      return;
    }
    if (password !== confirmPassword) {
      elements.authStatus.querySelector("span").textContent = "两次输入的密码不一致";
      return;
    }
  }

  const endpoint = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
  elements.authSubmitButton.disabled = true;
  elements.authSubmitButton.textContent = state.authMode === "register" ? "正在注册..." : "正在登录...";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "nickname", nickname, password }),
    });
    const payload = await response.json();
    if (!response.ok) {
      const messages = {
        INVALID_NICKNAME: "昵称需要 2 到 18 个字符",
        NICKNAME_ALREADY_REGISTERED: "这个昵称已经被使用",
        PASSWORD_TOO_SHORT: "密码至少需要 8 位",
        PASSWORD_WEAK: "密码需要同时包含字母和数字",
        PASSWORD_MATCHES_ACCOUNT: "密码不能和账号名称相同",
        INVALID_LOGIN: "昵称或密码错误",
      };
      throw new Error(messages[payload.error] || payload.error || "认证失败");
    }
    state.authUser = payload.user;
    updateAuthUI();
    elements.authDialog.close();
    showToast(state.authMode === "register" ? "注册成功" : "登录成功");
    promptDesktopInstaller();
  } catch (error) {
    elements.authStatus.querySelector("span").textContent = error.message;
  } finally {
    elements.authSubmitButton.disabled = false;
    elements.authSubmitButton.textContent = state.authMode === "register" ? "注册并登录" : "登录";
  }
}

async function submitEmailAuth() {
  const email = elements.authEmailInput.value.trim();
  const password = elements.authPasswordInput.value;
  if (!email || !password) {
    elements.authStatus.querySelector("span").textContent = "请填写邮箱和密码";
    return;
  }
  if (state.authMode === "register") {
    const passwordError = validateRegistrationPassword(password, email);
    if (passwordError) {
      elements.authStatus.querySelector("span").textContent = passwordError;
      return;
    }
  }
  const endpoint = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
  elements.authSubmitButton.disabled = true;
  elements.authSubmitButton.textContent = state.authMode === "register" ? "正在注册..." : "正在登录...";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, method: "email" }),
    });
    const payload = await response.json();
    if (!response.ok) {
      const messages = {
        INVALID_EMAIL: "邮箱格式不正确",
        PASSWORD_TOO_SHORT: "密码至少需要 8 位",
        PASSWORD_WEAK: "密码需要同时包含字母和数字",
        PASSWORD_MATCHES_ACCOUNT: "密码不能和账号名称相同",
        EMAIL_ALREADY_REGISTERED: "该邮箱已注册",
        INVALID_LOGIN: "邮箱或密码错误",
      };
      throw new Error(messages[payload.error] || payload.error || "认证失败");
    }
    state.authUser = payload.user;
    updateAuthUI();
    elements.authDialog.close();
    showToast(state.authMode === "register" ? "注册成功" : "登录成功");
    promptDesktopInstaller();
  } catch (error) {
    elements.authStatus.querySelector("span").textContent = error.message;
  } finally {
    elements.authSubmitButton.disabled = false;
    elements.authSubmitButton.textContent = state.authMode === "register" ? "注册并登录" : "登录";
  }
}

async function submitPhoneAuth() {
  const phone = elements.authPhoneInput.value.trim();
  const code = elements.authCodeInput.value.trim();
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    elements.authStatus.querySelector("span").textContent = "请输入正确的 11 位手机号";
    return;
  }
  if (!code || code.length !== 6) {
    elements.authStatus.querySelector("span").textContent = "请输入 6 位验证码";
    return;
  }
  const endpoint = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
  elements.authSubmitButton.disabled = true;
  elements.authSubmitButton.textContent = state.authMode === "register" ? "正在注册..." : "正在登录...";
  try {
    const body = { method: "phone", phone, code };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      const messages = {
        INVALID_PHONE: "请输入正确的手机号",
        INVALID_SMS_CODE: "验证码错误或已过期",
        PHONE_ALREADY_REGISTERED: "该手机号已注册",
        PHONE_NOT_REGISTERED: "该手机号尚未注册",
        INVALID_LOGIN: "手机号或验证码错误",
      };
      throw new Error(messages[payload.error] || payload.error || "认证失败");
    }
    state.authUser = payload.user;
    updateAuthUI();
    elements.authDialog.close();
    showToast(state.authMode === "register" ? "注册成功" : "登录成功");
    promptDesktopInstaller();
  } catch (error) {
    elements.authStatus.querySelector("span").textContent = error.message;
  } finally {
    elements.authSubmitButton.disabled = false;
    elements.authSubmitButton.textContent = state.authMode === "register" ? "注册并登录" : "登录";
  }
}

async function sendSmsCode() {
  const phone = elements.authPhoneInput.value.trim();
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    elements.authStatus.querySelector("span").textContent = "请输入正确的 11 位手机号";
    return;
  }
  elements.authSendCodeBtn.disabled = true;
  elements.authSendCodeBtn.textContent = "发送中...";
  try {
    const r = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await r.json();
    if (!r.ok) {
      throw new Error(data.error === "SMS_TOO_FREQUENT" ? "发送太频繁，请稍后再试" : (data.error || "发送失败"));
    }
    elements.authStatus.querySelector("span").textContent = `验证码已发送至 ${data.masked}`;
    // Cooldown countdown
    let sec = 60;
    elements.authSendCodeBtn.textContent = `${sec}s`;
    const timer = setInterval(() => {
      sec--;
      if (sec <= 0) {
        clearInterval(timer);
        elements.authSendCodeBtn.disabled = false;
        elements.authSendCodeBtn.textContent = "发送验证码";
      } else {
        elements.authSendCodeBtn.textContent = `${sec}s`;
      }
    }, 1000);
  } catch (error) {
    elements.authStatus.querySelector("span").textContent = error.message;
    elements.authSendCodeBtn.disabled = false;
    elements.authSendCodeBtn.textContent = "发送验证码";
  }
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Proceed with local logout even if the server is unreachable.
  }
  state.authUser = null;
  updateAuthUI();
  showToast("已退出登录");
}

async function adoptFree() {
  try {
    const response = await fetch("/api/auth/adopt-free", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      if (payload.error === "AUTH_REQUIRED") {
        elements.skinDialog.close();
        openAuthDialog("register");
        showToast("请先注册或登录");
        return;
      }
      throw new Error(payload.error || "领养失败");
    }
    state.authUser = payload.user;
    setDesktopDisplayMode("live");
    updateAuthUI();
    elements.skinDialog.close();
    showToast("已成功领养基础版赛博猫咪");
  } catch (error) {
    showToast(error.message);
  }
}

async function createCustomOrder() {
  try {
    elements.paymentConfirmButton.disabled = true;
    elements.paymentConfirmButton.textContent = "正在生成订单...";
    elements.paymentStatus.className = "fusion-status is-working";
    elements.paymentStatus.querySelector("span").textContent = "正在生成待支付订单";
    const response = await fetch("/api/payments/custom-order", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      if (payload.error === "AUTH_REQUIRED") {
        elements.paymentDialog.close();
        openAuthDialog("register");
        showToast("请先注册或登录后再付款开通");
        return;
      }
      throw new Error(payload.error || "下单失败");
    }
    state.currentPaymentOrderId = payload.order.id;
    localStorage.setItem("neko.customPayment.orderId", payload.order.id);
    elements.paymentOrderBox.hidden = false;
    elements.paymentOrderBox.textContent = `订单号：${payload.order.id} · 待确认 ¥${payload.order.amount}`;
    elements.paymentStatus.className = "fusion-status is-working";
    elements.paymentStatus.querySelector("span").textContent = "订单已生成。扫码付款后可先提交猫咪照片，后台会核对到账金额";
    elements.paymentConfirmButton.textContent = "查询付款状态";
    renderCustomAccess();
    showToast(`待支付订单已创建：${payload.order.id}`);
    startPaymentStatusPolling(payload.order.id);
  } catch (error) {
    elements.paymentStatus.className = "fusion-status is-error";
    elements.paymentStatus.querySelector("span").textContent = error.message;
    showToast(error.message);
  } finally {
    elements.paymentConfirmButton.disabled = false;
    if (!state.currentPaymentOrderId) {
      elements.paymentConfirmButton.textContent = "生成待支付订单";
    }
  }
}

async function checkPaymentStatus(orderId = state.currentPaymentOrderId) {
  if (!orderId) {
    createCustomOrder();
    return;
  }
  try {
    elements.paymentConfirmButton.disabled = true;
    const response = await fetch(`/api/payments/custom-order/${encodeURIComponent(orderId)}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "查询付款状态失败");
    }
    if (payload.order.status === "paid") {
      window.clearInterval(state.paymentPollTimer);
      state.paymentPollTimer = null;
      state.authUser = payload.user;
      localStorage.removeItem("neko.customPayment.orderId");
      state.currentPaymentOrderId = "";
      state.subStatus = {
        ...(state.subStatus || {}),
        plan: payload.user.plan,
        chatQuota: payload.user.chatQuota,
      };
      publishCustomPendingDesktopTwin();
      updateAuthUI();
      renderCustomAccess();
      elements.paymentStatus.className = "fusion-status is-ready";
      elements.paymentStatus.querySelector("span").textContent = "已确认到账 18.8 元，定制版已开通";
      window.setTimeout(() => elements.paymentDialog.close(), 700);
      showToast("付款已确认，定制版已开通");
      return;
    }
    elements.paymentStatus.className = "fusion-status is-working";
    elements.paymentStatus.querySelector("span").textContent = "尚未确认到账。已付款可先提交猫咪照片，后台会核对金额";
  } catch (error) {
    elements.paymentStatus.className = "fusion-status is-error";
    elements.paymentStatus.querySelector("span").textContent = error.message;
  } finally {
    elements.paymentConfirmButton.disabled = false;
    elements.paymentConfirmButton.textContent = state.currentPaymentOrderId ? "查询付款状态" : "生成待支付订单";
  }
}

function startPaymentStatusPolling(orderId) {
  window.clearInterval(state.paymentPollTimer);
  state.paymentPollTimer = window.setInterval(() => {
    checkPaymentStatus(orderId);
  }, 5000);
}

function showPaymentDialog() {
  if (hasConfirmedCustomPlan()) {
    showToast("定制版已开通");
    return;
  }
  if (elements.paymentStatus) {
    elements.paymentStatus.className = "fusion-status";
    elements.paymentStatus.querySelector("span").textContent = state.currentPaymentOrderId
      ? "订单已生成，等待后台确认到账"
      : "请先生成订单，再扫码支付 18.8 元";
  }
  if (elements.paymentOrderBox) {
    elements.paymentOrderBox.hidden = !state.currentPaymentOrderId;
    elements.paymentOrderBox.textContent = state.currentPaymentOrderId
      ? `订单号：${state.currentPaymentOrderId} · 待确认 ¥18.8`
      : "";
  }
  elements.paymentConfirmButton.textContent = state.currentPaymentOrderId
    ? "查询付款状态"
    : "生成待支付订单";
  if (typeof elements.paymentDialog.showModal === "function") {
    elements.paymentDialog.showModal();
  } else {
    elements.paymentDialog.setAttribute("open", "");
  }
}

async function checkAuth() {
  try {
    const response = await fetch("/api/auth/me");
    const payload = await response.json();
    if (payload.user) {
      state.authUser = payload.user;
      updateAuthUI();
    }
  } catch {
    // Not authenticated — that is fine for local-only use.
  }
  fetchSubStatus();
}

elements.loginButton.addEventListener("click", () => openAuthDialog("login"));
elements.registerButton.addEventListener("click", () => openAuthDialog("register"));
elements.logoutButton.addEventListener("click", logout);
elements.authCloseButton.addEventListener("click", () => elements.authDialog.close());
elements.authRegisterTab.addEventListener("click", () => openAuthDialog("register"));
elements.authLoginTab.addEventListener("click", () => openAuthDialog("login"));
elements.authSubmitButton.addEventListener("click", submitAuth);
elements.authSendCodeBtn.addEventListener("click", sendSmsCode);
// Method tabs
elements.authMethodTabs.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-method]");
  if (!btn) return;
  state.authMethod = btn.dataset.method;
  renderAuthMethod();
});
elements.freeAdoptButton.addEventListener("click", adoptFree);
elements.customOrderButton.addEventListener("click", showPaymentDialog);
elements.paymentCloseButton.addEventListener("click", () => elements.paymentDialog.close());
elements.paymentConfirmButton.addEventListener("click", () => {
  if (state.currentPaymentOrderId) {
    checkPaymentStatus();
  } else {
    createCustomOrder();
  }
});
elements.upgradeButton.addEventListener("click", () => {
  showToast("无限对话订阅暂未开放，当前先使用免费对话额度");
});

window.addEventListener("resize", resizePoseCanvas);
window.addEventListener("twin3dready", checkFusionAvailability);
window.addEventListener("beforeunload", () => {
  motionTwin.stop();
  remoteCamera.stop();
  cameraProtocol.destroy();
  window.cancelAnimationFrame(state.animationFrame);
  window.clearInterval(state.metricTimer);
  window.clearTimeout(state.posePreviewTimer);
});

cameraProtocol.addEventListener("deviceschanged", (event) => {
  renderCameraDevices(event.detail);
  elements.protocolLabel.textContent = `MediaStream · 已发现 ${event.detail.length} 个视频输入`;
});

cameraProtocol.addEventListener("disconnected", (event) => {
  if (state.mode !== "camera") {
    return;
  }

  state.mode = "idle";
  motionTwin.stop();
  elements.calibrateButton.disabled = true;
  elements.calibrateButton.classList.remove("is-calibrating");
  elements.cameraFeed.classList.remove("active");
  elements.cameraButtonLabel.textContent = "重新连接";
  elements.protocolLabel.textContent = `DISCONNECTED · ${event.detail.reason}`;
  setStatus("设备已断开");
  showToast("摄像头已断开，请检查设备连接后重试");
});

motionTwin.addEventListener("motion", (event) => {
  if (!["camera", "remote"].includes(state.mode) || state.paused) {
    return;
  }

  state.trackerLatency = Math.max(1, Math.round(performance.now() - event.detail.timestamp));
  if (event.detail.subjectState === "calibrating") {
    elements.subjectReadout.textContent = "校准中";
    elements.confidenceReadout.textContent = `${Math.round(event.detail.confidence * 100)}%`;
    return;
  }
  applyTwinData(event.detail);
});

remoteCamera.addEventListener("stream", async (event) => {
  elements.cameraFeed.srcObject = event.detail.stream;
  elements.cameraFeed.classList.add("no-mirror");
  await elements.cameraFeed.play();
  elements.cameraFeed.classList.add("active");
  const track = event.detail.stream.getVideoTracks()[0];
  const settings = track?.getSettings() || {};
  elements.resolutionLabel.textContent = `PHONE ${settings.width || "--"} × ${settings.height || "--"}`;
  elements.protocolLabel.textContent = "WebRTC · 手机视频直连";
  elements.cameraButtonLabel.textContent = "本机摄像头";
  elements.pairStatus.textContent = "手机视频已连接";
  startExperience("remote");
  motionTwin.start(elements.cameraFeed);
  window.setTimeout(() => elements.pairDialog.close(), 700);
  showToast("手机摄像头已接入数字分身");
});

remoteCamera.addEventListener("statechange", (event) => {
  const labels = {
    new: "等待手机连接",
    connecting: "正在建立视频通道",
    connected: "手机视频已连接",
    disconnected: "手机连接中断",
    failed: "WebRTC 连接失败",
    closed: "会话已关闭",
  };
  elements.pairStatus.textContent = labels[event.detail.state] || event.detail.state;
  if (
    ["disconnected", "failed"].includes(event.detail.state)
    && state.mode === "remote"
  ) {
    motionTwin.stop();
    setStatus("手机已断开");
    elements.protocolLabel.textContent = `WebRTC · ${labels[event.detail.state]}`;
  }
});

remoteCamera.addEventListener("error", () => {
  elements.pairStatus.textContent = "信令重连中";
});

motionTwin.addEventListener("calibrationprogress", (event) => {
  elements.calibrateButton.innerHTML = `<span></span>校准 ${Math.round(event.detail.progress * 100)}%`;
});

motionTwin.addEventListener("calibrationcomplete", () => {
  elements.calibrateButton.disabled = false;
  elements.calibrateButton.classList.remove("is-calibrating");
  elements.calibrateButton.innerHTML = "<span></span>重新校准";
  elements.subjectReadout.textContent = "搜索中";
  setStatus("正在追踪", true);
  showToast("环境校准完成，等待主体进入画面");
});

// --- Community ---
const communityContent = document.querySelector("#communityContent");
const communityTopic = document.querySelector("#communityTopic");
const communityPostBtn = document.querySelector("#communityPostBtn");
const communityFeed = document.querySelector("#communityFeed");
const communityShareBox = document.querySelector("#communityShareBox");
const communityLoginHint = document.querySelector("#communityLoginHint");
const communityImageInput = document.querySelector("#communityImageInput");
const sharePreview = document.querySelector("#sharePreview");
const sharePreviewImg = document.querySelector("#sharePreviewImg");
const shareRemoveImage = document.querySelector("#shareRemoveImage");
const communityTopics = document.querySelector("#communityTopics");
let communityImageData = null;
let communityActiveTopic = "";

function updateCommunityAuthUI() {
  if (state.authUser) {
    communityShareBox.classList.add("is-logged-in");
    communityPostBtn.disabled = !communityContent.value.trim() && !communityImageData;
  } else {
    communityShareBox.classList.remove("is-logged-in");
    communityPostBtn.disabled = true;
  }
}

communityContent.addEventListener("input", () => {
  communityPostBtn.disabled = !communityContent.value.trim() && !communityImageData;
});

// Image upload
document.querySelector("#shareImageBtn").addEventListener("click", () => communityImageInput.click());
communityImageInput.addEventListener("change", () => {
  const file = communityImageInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    communityImageData = reader.result;
    sharePreviewImg.src = reader.result;
    sharePreview.hidden = false;
    communityPostBtn.disabled = false;
  };
  reader.readAsDataURL(file);
});
shareRemoveImage.addEventListener("click", () => {
  communityImageData = null;
  sharePreview.hidden = true;
  communityImageInput.value = "";
  communityPostBtn.disabled = !communityContent.value.trim();
});

// Topic chips
communityTopics.addEventListener("click", (e) => {
  const chip = e.target.closest(".community-topic-chip");
  if (!chip) return;
  communityTopics.querySelectorAll(".community-topic-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  communityActiveTopic = chip.dataset.topic;
  loadCommunityFeed();
});

async function loadCommunityFeed() {
  try {
    const params = new URLSearchParams({ limit: "30" });
    if (communityActiveTopic) params.set("topic", communityActiveTopic);
    const r = await fetch(`/api/community/posts?${params}`, { cache: "no-store" });
    if (!r.ok) throw new Error("LOAD_FAILED");
    const data = await r.json();
    renderCommunityFeed(data.posts);
  } catch {
    communityFeed.innerHTML = '<div class="community-loading">加载失败，请刷新页面</div>';
  }
}

function renderCommunityFeed(posts) {
  if (!posts || !posts.length) {
    communityFeed.innerHTML = '<div class="community-empty">还没有人分享，来做第一个吧</div>';
    return;
  }
  communityFeed.innerHTML = posts.map((post) => {
    const time = new Date(post.createdAt);
    const timeStr = time.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
    const liked = post.likedBy && state.authUser && post.likedBy.includes(state.authUser.id);
    const avatarChar = (post.petName || "N")[0];
    const hasImage = post.type === "mixed" && post.imageUrl;
    const cardClass = hasImage ? "community-card is-mixed" : "community-card is-text";

    return `
      <article class="${cardClass}">
        ${hasImage ? `<img class="community-card-image" src="${escapeAttr(post.imageUrl)}" alt="" loading="lazy" />` : ""}
        <div class="community-card-body">
          ${post.topic ? `<span class="community-card-topic">#${escapeHtml(post.topic)}</span>` : ""}
          <p class="community-card-content">${escapeHtml(post.content)}</p>
          <div class="community-card-footer">
            <div class="community-card-user-info">
              <span class="community-card-avatar">${escapeHtml(avatarChar)}</span>
              <span class="community-card-pet">${escapeHtml(post.petName)}</span>
            </div>
            <span class="community-card-time">${timeStr}</span>
          </div>
          <button class="community-like-btn${liked ? ' is-liked' : ''}" data-post-id="${post.id}" type="button">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="${liked ? '#ff2442' : 'none'}" stroke="currentColor" stroke-width="1.5"/></svg>
            <span>${post.likes || 0}</span>
          </button>
        </div>
      </article>`;
  }).join("");

  // Like listeners
  communityFeed.querySelectorAll(".community-like-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!state.authUser) { showToast("请先登录"); return; }
      const postId = btn.dataset.postId;
      try {
        const r = await fetch(`/api/community/posts/${postId}/like`, { method: "POST" });
        if (!r.ok) throw new Error("LIKE_FAILED");
        const result = await r.json();
        btn.classList.toggle("is-liked", result.liked);
        btn.querySelector("span").textContent = result.likes;
        const svg = btn.querySelector("svg path");
        if (svg) svg.setAttribute("fill", result.liked ? "#ff2442" : "none");
      } catch { showToast("操作失败"); }
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
function escapeAttr(str) {
  return String(str || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

communityPostBtn.addEventListener("click", async () => {
  const content = communityContent.value.trim();
  if ((!content && !communityImageData) || !state.authUser) return;
  communityPostBtn.disabled = true;
  communityPostBtn.textContent = "发布中...";
  try {
    const body = {
      content: content || "分享了一张图片",
      petName: "Neko",
      topic: communityTopic.value,
    };
    if (communityImageData) body.image = communityImageData;
    const r = await fetch("/api/community/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error);
    }
    communityContent.value = "";
    communityTopic.value = "";
    communityImageData = null;
    sharePreview.hidden = true;
    communityImageInput.value = "";
    communityPostBtn.textContent = "发布";
    communityPostBtn.disabled = true;
    showToast("发布成功！");
    loadCommunityFeed();
  } catch (err) {
    communityPostBtn.textContent = "发布";
    communityPostBtn.disabled = false;
    showToast(err.message === "AUTH_REQUIRED" ? "请先登录" : "发布失败");
  }
});

// Patch updateAuthUI to also update community
const _origUpdateAuthUI2 = updateAuthUI;
updateAuthUI = function() {
  _origUpdateAuthUI2();
  updateCommunityAuthUI();
};

loadCommunityFeed();

resizePoseCanvas();
refreshCameraDevices();
renderDesktopTwinToggle();
loadDesktopPlatform();
loadSavedSkin();
checkAuth();
animationLoop(performance.now());
