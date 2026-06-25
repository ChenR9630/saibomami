const capturePlan = [
  ["正面", "镜头与猫眼睛同高，完整拍到头、身体和四肢。"],
  ["左前 15°", "向猫的左侧移动一小步，保持距离不变。"],
  ["左前 30°", "继续绕猫缓慢移动，不要让猫跟着镜头转头。"],
  ["左前 45°", "确保耳朵、脸颊和左侧身体清晰。"],
  ["左侧 60°", "保持猫完整位于椭圆引导框内。"],
  ["左侧 75°", "避免手、玩具或家具遮挡身体。"],
  ["左侧 90°", "拍摄完整侧面轮廓和尾巴。"],
  ["左后 105°", "继续绕行，照片之间保持足够重叠。"],
  ["左后 120°", "对焦身体中央，避免运动模糊。"],
  ["左后 135°", "确保后腿和背部清晰。"],
  ["左后 150°", "保持相同高度与距离。"],
  ["后方 180°", "拍摄后背、后腿和尾巴根部。"],
  ["右后 150°", "从另一侧继续绕回正面。"],
  ["右后 135°", "确保右后腿没有被尾巴完全遮挡。"],
  ["右后 120°", "保持猫身体填满引导区域。"],
  ["右后 105°", "照片应清晰、无变焦变化。"],
  ["右侧 90°", "拍摄完整右侧轮廓。"],
  ["右侧 75°", "保持猫的姿势与前一圈一致。"],
  ["右侧 60°", "确认腹部与前腿可见。"],
  ["右前 45°", "对焦脸部与胸口。"],
  ["右前 30°", "保持背景简单且静止。"],
  ["右前 15°", "逐步回到正面。"],
  ["俯视左前", "将手机提高约 30 厘米，向下拍摄背部。"],
  ["俯视右后", "从对角线补拍背部和尾巴纹理。"],
];

const scanElements = {
  video: document.querySelector("#scanVideo"),
  canvas: document.querySelector("#scanCanvas"),
  counter: document.querySelector("#scanCounter"),
  state: document.querySelector("#scanState"),
  step: document.querySelector("#scanStep"),
  direction: document.querySelector("#guideDirection"),
  progress: document.querySelector("#scanProgress"),
  start: document.querySelector("#startScanButton"),
  capture: document.querySelector("#captureButton"),
  finish: document.querySelector("#finishScanButton"),
};

const scanState = {
  stream: null,
  scanId: null,
  frameIndex: 0,
  uploading: false,
};

function updateGuide() {
  const [direction, instruction] = capturePlan[scanState.frameIndex] || [
    "采集完成",
    "照片已采集完成，可以提交到电脑进行 3D 重建。",
  ];
  scanElements.direction.textContent = direction;
  scanElements.step.textContent = instruction;
  scanElements.counter.textContent = `${scanState.frameIndex} / ${capturePlan.length}`;
  scanElements.progress.style.width = `${scanState.frameIndex / capturePlan.length * 100}%`;
  scanElements.capture.disabled = (
    !scanState.stream
    || scanState.uploading
    || scanState.frameIndex >= capturePlan.length
  );
  scanElements.finish.disabled = scanState.frameIndex < 12 || scanState.uploading;
}

async function startScan() {
  scanElements.start.disabled = true;
  scanElements.state.textContent = "正在请求摄像头权限";
  try {
    scanState.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    scanElements.video.srcObject = scanState.stream;
    await scanElements.video.play();
    scanElements.state.textContent = "正在创建扫描会话";
    const sessionResponse = await fetch("/api/scans", { method: "POST" });
    if (!sessionResponse.ok) {
      throw new Error("无法创建扫描会话");
    }
    const session = await sessionResponse.json();
    scanState.scanId = session.id;
    scanElements.state.textContent = `本地扫描 ${scanState.scanId}`;
    scanElements.start.textContent = "扫描进行中";
    updateGuide();
  } catch (error) {
    scanState.stream?.getTracks().forEach((track) => track.stop());
    scanState.stream = null;
    scanElements.state.textContent = error.message;
    scanElements.start.disabled = false;
  }
}

async function captureFrame() {
  if (!scanState.stream || scanState.uploading) {
    return;
  }
  scanState.uploading = true;
  updateGuide();
  scanElements.state.textContent = "正在保存照片";

  const videoWidth = scanElements.video.videoWidth;
  const videoHeight = scanElements.video.videoHeight;
  scanElements.canvas.width = videoWidth;
  scanElements.canvas.height = videoHeight;
  scanElements.canvas.getContext("2d").drawImage(
    scanElements.video,
    0,
    0,
    videoWidth,
    videoHeight,
  );
  const blob = await new Promise((resolve) => (
    scanElements.canvas.toBlob(resolve, "image/jpeg", 0.94)
  ));

  try {
    const response = await fetch(
      `/api/scans/${scanState.scanId}/frames?index=${scanState.frameIndex}`,
      {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      },
    );
    if (!response.ok) {
      throw new Error("照片保存失败");
    }
    scanState.frameIndex += 1;
    scanElements.state.textContent = "照片已保存到电脑";
  } catch (error) {
    scanElements.state.textContent = error.message;
  } finally {
    scanState.uploading = false;
    updateGuide();
  }
}

async function finishScan() {
  scanState.uploading = true;
  updateGuide();
  const response = await fetch(`/api/scans/${scanState.scanId}/complete`, {
    method: "POST",
  });
  const manifest = await response.json();
  scanElements.state.textContent = manifest.status === "ready"
    ? `采集完成：${manifest.frames.length} 张，回到电脑开始重建`
    : `至少需要 12 张照片，当前 ${manifest.frames.length} 张`;
  scanState.uploading = false;
  updateGuide();
}

scanElements.start.addEventListener("click", startScan);
scanElements.capture.addEventListener("click", captureFrame);
scanElements.finish.addEventListener("click", finishScan);
window.addEventListener("beforeunload", () => {
  scanState.stream?.getTracks().forEach((track) => track.stop());
});

updateGuide();
