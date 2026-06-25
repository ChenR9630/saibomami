(function motionTwinModule(global) {
  class MotionTwinEngine extends EventTarget {
    constructor(options = {}) {
      super();
      this.width = options.width || 96;
      this.height = options.height || 54;
      this.sampleInterval = 1000 / (options.sampleRate || 12);
      this.pixelThreshold = options.pixelThreshold || 24;
      this.minimumMotionRatio = options.minimumMotionRatio || 0.012;
      this.backgroundThreshold = options.backgroundThreshold || 34;
      this.minimumComponentPixels = options.minimumComponentPixels || 12;
      this.canvas = document.createElement("canvas");
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.context = this.canvas.getContext("2d", { willReadFrequently: true });
      this.video = null;
      this.previousFrame = null;
      this.backgroundFrame = null;
      this.calibrationFrames = [];
      this.calibrationTarget = 18;
      this.calibrating = false;
      this.running = false;
      this.lastSampleAt = 0;
      this.lastCentroid = null;
      this.lockFrames = 0;
      this.missedFrames = 0;
      this.smoothed = this.createEmptyResult();
      this.animationFrame = null;
    }

    start(video) {
      this.stop();
      this.video = video;
      this.previousFrame = null;
      this.backgroundFrame = null;
      this.calibrationFrames = [];
      this.calibrating = false;
      this.lastCentroid = null;
      this.lockFrames = 0;
      this.missedFrames = 0;
      this.smoothed = this.createEmptyResult();
      this.running = true;
      this.animationFrame = requestAnimationFrame((time) => this.loop(time));
    }

    stop() {
      this.running = false;
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
      }
      this.animationFrame = null;
      this.previousFrame = null;
      this.calibrationFrames = [];
      this.calibrating = false;
    }

    calibrate(frameCount = 18) {
      this.calibrationTarget = Math.max(6, frameCount);
      this.calibrationFrames = [];
      this.calibrating = true;
      this.dispatchEvent(new CustomEvent("calibrationstart", {
        detail: { target: this.calibrationTarget },
      }));
    }

    loop(time) {
      if (!this.running) {
        return;
      }

      if (time - this.lastSampleAt >= this.sampleInterval) {
        this.lastSampleAt = time;
        const result = this.analyzeFrame(time);
        if (result) {
          this.dispatchEvent(new CustomEvent("motion", { detail: result }));
        }
      }

      this.animationFrame = requestAnimationFrame((nextTime) => this.loop(nextTime));
    }

    analyzeFrame(timestamp) {
      if (!this.video || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return null;
      }

      this.context.drawImage(this.video, 0, 0, this.width, this.height);
      const imageData = this.context.getImageData(0, 0, this.width, this.height);
      const grayscale = new Uint8Array(this.width * this.height);

      for (let source = 0, target = 0; source < imageData.data.length; source += 4, target += 1) {
        grayscale[target] = Math.round(
          imageData.data[source] * 0.299
          + imageData.data[source + 1] * 0.587
          + imageData.data[source + 2] * 0.114,
        );
      }

      if (!this.previousFrame) {
        this.previousFrame = grayscale;
        if (!this.backgroundFrame) {
          this.backgroundFrame = new Float32Array(grayscale);
        }
        return this.smoothed;
      }

      if (this.calibrating) {
        return this.captureCalibrationFrame(grayscale, timestamp);
      }

      const mask = new Uint8Array(this.width * this.height);

      for (let y = 1; y < this.height - 1; y += 1) {
        for (let x = 1; x < this.width - 1; x += 1) {
          const index = y * this.width + x;
          const frameDifference = Math.abs(grayscale[index] - this.previousFrame[index]);
          const backgroundDifference = this.backgroundFrame
            ? Math.abs(grayscale[index] - this.backgroundFrame[index])
            : frameDifference;

          if (
            frameDifference < this.pixelThreshold
            || backgroundDifference < this.backgroundThreshold
          ) {
            continue;
          }

          mask[index] = 1;
        }
      }

      this.previousFrame = grayscale;
      this.updateBackground(grayscale, mask);
      const component = this.findLargestComponent(mask);
      const motionRatio = component
        ? component.pixelCount / (this.width * this.height)
        : 0;
      const hasMotion = Boolean(component && motionRatio >= this.minimumMotionRatio);
      const rawX = hasMotion ? component.centerX / this.width : this.smoothed.x;
      const rawY = hasMotion ? component.centerY / this.height : this.smoothed.y;
      const previousCentroid = this.lastCentroid || { x: rawX, y: rawY };
      const deltaX = rawX - previousCentroid.x;
      const deltaY = rawY - previousCentroid.y;
      const speed = Math.min(1, Math.hypot(deltaX, deltaY) * 7 + motionRatio * 2.4);
      const intensity = Math.min(1, motionRatio * 5.2);
      const confidence = hasMotion
        ? Math.min(0.99, 0.34 + motionRatio * 4.5 + Math.min(this.lockFrames, 12) * 0.025)
        : Math.max(0, this.smoothed.confidence * 0.86);
      const action = this.classifyAction({
        hasMotion,
        speed,
        intensity,
        deltaY,
        bounds: component
          ? {
              width: (component.maxX - component.minX) / this.width,
              height: (component.maxY - component.minY) / this.height,
            }
          : this.smoothed.bounds,
      });

      if (hasMotion) {
        this.lastCentroid = { x: rawX, y: rawY };
        this.lockFrames += 1;
        this.missedFrames = 0;
      } else {
        this.missedFrames += 1;
        this.lockFrames = Math.max(0, this.lockFrames - 2);
      }

      const target = {
        timestamp,
        hasMotion,
        x: rawX,
        y: rawY,
        deltaX,
        deltaY,
        speed,
        intensity,
        confidence,
        subjectState: this.getSubjectState(hasMotion),
        calibrated: Boolean(this.backgroundFrame),
        direction: Math.abs(deltaX) < 0.008 ? 0 : Math.sign(deltaX),
        action,
        bounds: hasMotion
          ? {
              x: component.minX / this.width,
              y: component.minY / this.height,
              width: (component.maxX - component.minX) / this.width,
              height: (component.maxY - component.minY) / this.height,
            }
          : this.smoothed.bounds,
      };

      this.smoothed = this.smoothResult(this.smoothed, target, hasMotion ? 0.36 : 0.12);
      this.smoothed.action = action;
      this.smoothed.hasMotion = hasMotion;
      this.smoothed.timestamp = timestamp;
      return this.smoothed;
    }

    captureCalibrationFrame(grayscale, timestamp) {
      this.calibrationFrames.push(grayscale);
      const progress = this.calibrationFrames.length / this.calibrationTarget;
      this.dispatchEvent(new CustomEvent("calibrationprogress", {
        detail: { progress },
      }));
      this.previousFrame = grayscale;

      if (this.calibrationFrames.length < this.calibrationTarget) {
        return {
          ...this.smoothed,
          timestamp,
          subjectState: "calibrating",
          confidence: progress,
        };
      }

      const background = new Float32Array(this.width * this.height);
      for (let index = 0; index < background.length; index += 1) {
        let sum = 0;
        this.calibrationFrames.forEach((frame) => {
          sum += frame[index];
        });
        background[index] = sum / this.calibrationFrames.length;
      }

      this.backgroundFrame = background;
      this.calibrationFrames = [];
      this.calibrating = false;
      this.lockFrames = 0;
      this.missedFrames = 0;
      this.dispatchEvent(new CustomEvent("calibrationcomplete"));
      return {
        ...this.smoothed,
        timestamp,
        subjectState: "searching",
        calibrated: true,
        confidence: 0,
      };
    }

    updateBackground(grayscale, mask) {
      if (!this.backgroundFrame) {
        this.backgroundFrame = new Float32Array(grayscale);
        return;
      }

      const learningRate = 0.018;
      for (let index = 0; index < grayscale.length; index += 1) {
        if (mask[index]) {
          continue;
        }
        this.backgroundFrame[index] += (
          grayscale[index] - this.backgroundFrame[index]
        ) * learningRate;
      }
    }

    findLargestComponent(mask) {
      const visited = new Uint8Array(mask.length);
      const queue = new Int32Array(mask.length);
      let largest = null;

      for (let index = 0; index < mask.length; index += 1) {
        if (!mask[index] || visited[index]) {
          continue;
        }

        let head = 0;
        let tail = 0;
        queue[tail++] = index;
        visited[index] = 1;
        let pixelCount = 0;
        let sumX = 0;
        let sumY = 0;
        let minX = this.width;
        let minY = this.height;
        let maxX = 0;
        let maxY = 0;

        while (head < tail) {
          const current = queue[head++];
          const x = current % this.width;
          const y = Math.floor(current / this.width);
          pixelCount += 1;
          sumX += x;
          sumY += y;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);

          const neighbors = [
            current - 1,
            current + 1,
            current - this.width,
            current + this.width,
          ];
          neighbors.forEach((neighbor) => {
            if (
              neighbor < 0
              || neighbor >= mask.length
              || visited[neighbor]
              || !mask[neighbor]
            ) {
              return;
            }

            const neighborX = neighbor % this.width;
            if (Math.abs(neighborX - x) > 1) {
              return;
            }
            visited[neighbor] = 1;
            queue[tail++] = neighbor;
          });
        }

        if (
          pixelCount >= this.minimumComponentPixels
          && (!largest || pixelCount > largest.pixelCount)
        ) {
          largest = {
            pixelCount,
            centerX: sumX / pixelCount,
            centerY: sumY / pixelCount,
            minX,
            minY,
            maxX,
            maxY,
          };
        }
      }

      return largest;
    }

    getSubjectState(hasMotion) {
      if (this.calibrating) {
        return "calibrating";
      }
      if (hasMotion && this.lockFrames >= 4) {
        return "locked";
      }
      if (hasMotion) {
        return "acquiring";
      }
      if (this.missedFrames < 8 && this.lockFrames > 0) {
        return "holding";
      }
      return "searching";
    }

    classifyAction({ hasMotion, speed, intensity, deltaY, bounds }) {
      if (!hasMotion || intensity < 0.09) {
        return "idle";
      }
      if (deltaY < -0.032 && speed > 0.34 && intensity > 0.22) {
        return "jumping";
      }
      if (
        bounds
        && bounds.width / Math.max(bounds.height, 0.01) > 1.55
        && speed < 0.17
        && intensity < 0.26
      ) {
        return "lying";
      }
      if (deltaY < -0.018 && intensity > 0.2) {
        return "alert";
      }
      if (speed > 0.2 || intensity > 0.3) {
        return "walking";
      }
      return "tracking";
    }

    smoothResult(previous, next, weight) {
      const mix = (from, to) => from + (to - from) * weight;
      return {
        ...next,
        x: mix(previous.x, next.x),
        y: mix(previous.y, next.y),
        deltaX: mix(previous.deltaX, next.deltaX),
        deltaY: mix(previous.deltaY, next.deltaY),
        speed: mix(previous.speed, next.speed),
        intensity: mix(previous.intensity, next.intensity),
        confidence: mix(previous.confidence, next.confidence),
        bounds: {
          x: mix(previous.bounds.x, next.bounds.x),
          y: mix(previous.bounds.y, next.bounds.y),
          width: mix(previous.bounds.width, next.bounds.width),
          height: mix(previous.bounds.height, next.bounds.height),
        },
      };
    }

    createEmptyResult() {
      return {
        timestamp: 0,
        hasMotion: false,
        x: 0.5,
        y: 0.55,
        deltaX: 0,
        deltaY: 0,
        speed: 0,
        intensity: 0,
        confidence: 0,
        subjectState: "searching",
        calibrated: false,
        direction: 0,
        action: "idle",
        bounds: {
          x: 0.28,
          y: 0.28,
          width: 0.44,
          height: 0.5,
        },
      };
    }
  }

  global.MotionTwinEngine = MotionTwinEngine;
})(window);
