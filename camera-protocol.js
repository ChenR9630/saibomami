(function cameraProtocolModule(global) {
  const ERROR_CODES = {
    NotAllowedError: "PERMISSION_DENIED",
    NotFoundError: "DEVICE_NOT_FOUND",
    NotReadableError: "DEVICE_BUSY",
    OverconstrainedError: "CONSTRAINT_UNSUPPORTED",
    SecurityError: "INSECURE_CONTEXT",
    AbortError: "DEVICE_ABORTED",
  };

  class CameraProtocol extends EventTarget {
    constructor() {
      super();
      this.stream = null;
      this.activeDeviceId = null;
      this.deviceChangeHandler = () => this.handleDeviceChange();

      navigator.mediaDevices?.addEventListener("devicechange", this.deviceChangeHandler);
    }

    get supported() {
      return Boolean(navigator.mediaDevices?.getUserMedia);
    }

    async requestPermission() {
      if (!this.supported) {
        throw this.createError("UNSUPPORTED", "当前浏览器不支持摄像头协议");
      }

      const permissionStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      permissionStream.getTracks().forEach((track) => track.stop());
      return this.listDevices();
    }

    async listDevices() {
      if (!navigator.mediaDevices?.enumerateDevices) {
        return [];
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          id: device.deviceId,
          groupId: device.groupId,
          label: device.label || `摄像头 ${index + 1}`,
        }));
    }

    async connect(options = {}) {
      if (!this.supported) {
        throw this.createError("UNSUPPORTED", "当前浏览器不支持摄像头协议");
      }

      this.stop();

      const video = {
        width: { ideal: options.width || 1280 },
        height: { ideal: options.height || 720 },
        frameRate: { ideal: options.frameRate || 30, max: 60 },
      };

      if (options.deviceId) {
        video.deviceId = { exact: options.deviceId };
      } else {
        video.facingMode = { ideal: options.facingMode || "environment" };
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video,
          audio: false,
        });
        const track = stream.getVideoTracks()[0];

        if (!track) {
          throw this.createError("NO_VIDEO_TRACK", "摄像头未返回视频轨道");
        }

        this.stream = stream;
        this.activeDeviceId = track.getSettings().deviceId || options.deviceId || null;
        track.addEventListener("ended", () => {
          if (this.stream !== stream) {
            return;
          }
          this.stream = null;
          this.dispatchEvent(new CustomEvent("disconnected", {
            detail: { reason: "TRACK_ENDED" },
          }));
        }, { once: true });

        const metadata = this.getMetadata(track);
        this.dispatchEvent(new CustomEvent("connected", { detail: metadata }));
        return { stream, metadata };
      } catch (error) {
        const protocolError = this.normalizeError(error);
        this.dispatchEvent(new CustomEvent("error", { detail: protocolError }));
        throw protocolError;
      }
    }

    stop() {
      if (!this.stream) {
        return;
      }

      const stream = this.stream;
      this.stream = null;
      this.activeDeviceId = null;
      stream.getTracks().forEach((track) => track.stop());
    }

    async handleDeviceChange() {
      const devices = await this.listDevices();
      this.dispatchEvent(new CustomEvent("deviceschanged", { detail: devices }));

      if (
        this.activeDeviceId
        && !devices.some((device) => device.id === this.activeDeviceId)
      ) {
        this.dispatchEvent(new CustomEvent("disconnected", {
          detail: { reason: "DEVICE_REMOVED" },
        }));
      }
    }

    getMetadata(track) {
      const settings = track.getSettings();
      return {
        deviceId: settings.deviceId || null,
        label: track.label || "Camera",
        width: settings.width || 0,
        height: settings.height || 0,
        frameRate: Math.round(settings.frameRate || 0),
        facingMode: settings.facingMode || null,
        protocol: "mediastream",
      };
    }

    normalizeError(error) {
      if (error?.code && error?.message) {
        return error;
      }

      const code = ERROR_CODES[error?.name] || "CAMERA_UNKNOWN";
      const messages = {
        PERMISSION_DENIED: "摄像头权限被拒绝，请在浏览器设置中允许访问",
        DEVICE_NOT_FOUND: "没有检测到可用摄像头",
        DEVICE_BUSY: "摄像头正被其他应用占用",
        CONSTRAINT_UNSUPPORTED: "摄像头不支持所选分辨率或帧率",
        INSECURE_CONTEXT: "摄像头仅允许在 HTTPS 或 localhost 中使用",
        DEVICE_ABORTED: "摄像头启动被系统中断",
        CAMERA_UNKNOWN: "摄像头连接失败",
      };
      return this.createError(code, messages[code], error);
    }

    createError(code, message, cause) {
      const error = new Error(message, cause ? { cause } : undefined);
      error.code = code;
      return error;
    }

    destroy() {
      this.stop();
      navigator.mediaDevices?.removeEventListener("devicechange", this.deviceChangeHandler);
    }
  }

  global.CameraProtocol = CameraProtocol;
})(window);
