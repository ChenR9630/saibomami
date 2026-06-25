const senderElements = {
  form: document.querySelector("#senderForm"),
  roomCode: document.querySelector("#roomCode"),
  facingMode: document.querySelector("#facingMode"),
  button: document.querySelector("#senderButton"),
  video: document.querySelector("#senderVideo"),
  previewEmpty: document.querySelector("#previewEmpty"),
  state: document.querySelector("#senderState"),
  resolution: document.querySelector("#senderResolution"),
  hint: document.querySelector("#senderHint"),
};

const senderState = {
  stream: null,
  peer: null,
  roomId: null,
  running: false,
  lastSignalAt: 0,
  pendingCandidates: [],
};

const roomFromUrl = new URLSearchParams(location.search).get("room");
if (roomFromUrl) {
  senderElements.roomCode.value = roomFromUrl.toUpperCase().slice(0, 6);
}

function setSenderStatus(label, hint) {
  senderElements.state.textContent = label;
  if (hint) {
    senderElements.hint.textContent = hint;
  }
}

async function sendSenderSignal(message) {
  const response = await fetch(`/api/signal/${senderState.roomId}/sender`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    throw new Error("信令发送失败");
  }
}

async function handleSenderSignal(message) {
  if (!senderState.peer) {
    return;
  }
  if (message.type === "offer") {
    await senderState.peer.setRemoteDescription(message.sdp);
    for (const candidate of senderState.pendingCandidates.splice(0)) {
      await senderState.peer.addIceCandidate(candidate);
    }
    const answer = await senderState.peer.createAnswer();
    await senderState.peer.setLocalDescription(answer);
    await sendSenderSignal({ type: "answer", sdp: senderState.peer.localDescription });
  } else if (message.type === "candidate") {
    if (senderState.peer.remoteDescription) {
      await senderState.peer.addIceCandidate(message.candidate);
    } else {
      senderState.pendingCandidates.push(message.candidate);
    }
  }
}

async function pollSenderSignals() {
  while (senderState.running) {
    try {
      const response = await fetch(
        `/api/signal/${senderState.roomId}/sender?since=${senderState.lastSignalAt}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error("信令连接失败");
      }
      const payload = await response.json();
      for (const entry of payload.messages) {
        senderState.lastSignalAt = Math.max(senderState.lastSignalAt, entry.createdAt);
        await handleSenderSignal(entry.message);
      }
    } catch (error) {
      if (senderState.running) {
        setSenderStatus("信令重连中", error.message);
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }
}

function stopSender() {
  senderState.running = false;
  senderState.peer?.close();
  senderState.stream?.getTracks().forEach((track) => track.stop());
  senderState.peer = null;
  senderState.stream = null;
  senderState.lastSignalAt = 0;
  senderState.pendingCandidates = [];
}

async function startSender(event) {
  event.preventDefault();
  stopSender();

  const roomId = senderElements.roomCode.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(roomId)) {
    setSenderStatus("配对码错误", "请输入电脑端显示的 6 位配对码");
    return;
  }

  senderElements.button.disabled = true;
  senderElements.button.textContent = "正在开启摄像头";
  senderState.roomId = roomId;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: senderElements.facingMode.value },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    });
    senderState.stream = stream;
    senderElements.video.srcObject = stream;
    await senderElements.video.play();
    senderElements.previewEmpty.classList.add("hidden");

    const settings = stream.getVideoTracks()[0].getSettings();
    senderElements.resolution.textContent = `CAM ${settings.width || "--"} × ${settings.height || "--"}`;

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    senderState.peer = peer;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.addEventListener("icecandidate", (iceEvent) => {
      if (iceEvent.candidate) {
        sendSenderSignal({ type: "candidate", candidate: iceEvent.candidate });
      }
    });
    peer.addEventListener("connectionstatechange", () => {
      const connectionState = peer.connectionState;
      const labels = {
        connected: "已连接电脑",
        connecting: "正在建立视频",
        disconnected: "连接中断",
        failed: "连接失败",
        closed: "连接关闭",
      };
      setSenderStatus(
        labels[connectionState] || "等待电脑",
        connectionState === "connected"
          ? "手机可保持亮屏放置在宠物活动区域。"
          : "请确认手机和电脑连接同一局域网。",
      );
    });

    senderState.running = true;
    setSenderStatus("等待电脑", `配对码 ${roomId}，正在等待 WebRTC 会话`);
    senderElements.button.textContent = "摄像头已开启";
    pollSenderSignals();
  } catch (error) {
    setSenderStatus("无法开启", error.message || "请检查摄像头权限");
    senderElements.button.textContent = "重新尝试";
  } finally {
    senderElements.button.disabled = false;
  }
}

senderElements.roomCode.addEventListener("input", () => {
  senderElements.roomCode.value = senderElements.roomCode.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
});
senderElements.form.addEventListener("submit", startSender);
window.addEventListener("beforeunload", stopSender);
