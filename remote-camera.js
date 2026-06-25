(function remoteCameraModule(global) {
  class RemoteCameraReceiver extends EventTarget {
    constructor() {
      super();
      this.roomId = null;
      this.peer = null;
      this.running = false;
      this.lastSignalAt = 0;
      this.pendingCandidates = [];
    }

    async start(roomId) {
      this.stop();
      this.roomId = roomId;
      this.running = true;
      this.peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      this.peer.addTransceiver("video", { direction: "recvonly" });
      this.peer.addEventListener("track", (event) => {
        const stream = event.streams[0] || new MediaStream([event.track]);
        this.dispatchEvent(new CustomEvent("stream", { detail: { stream } }));
      });
      this.peer.addEventListener("icecandidate", (event) => {
        if (event.candidate) {
          this.sendSignal({ type: "candidate", candidate: event.candidate });
        }
      });
      this.peer.addEventListener("connectionstatechange", () => {
        const state = this.peer?.connectionState || "closed";
        this.dispatchEvent(new CustomEvent("statechange", { detail: { state } }));
      });

      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(offer);
      await this.sendSignal({ type: "offer", sdp: this.peer.localDescription });
      this.pollSignals();
    }

    async sendSignal(message) {
      const response = await fetch(`/api/signal/${this.roomId}/receiver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      if (!response.ok) {
        throw new Error("SIGNAL_SEND_FAILED");
      }
    }

    async pollSignals() {
      while (this.running) {
        try {
          const response = await fetch(
            `/api/signal/${this.roomId}/receiver?since=${this.lastSignalAt}`,
            { cache: "no-store" },
          );
          if (!response.ok) {
            throw new Error("SIGNAL_POLL_FAILED");
          }
          const payload = await response.json();
          for (const entry of payload.messages) {
            this.lastSignalAt = Math.max(this.lastSignalAt, entry.createdAt);
            await this.handleSignal(entry.message);
          }
        } catch (error) {
          if (this.running) {
            this.dispatchEvent(new CustomEvent("error", { detail: error }));
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
        }
      }
    }

    async handleSignal(message) {
      if (!this.peer) {
        return;
      }
      if (message.type === "answer") {
        await this.peer.setRemoteDescription(message.sdp);
        for (const candidate of this.pendingCandidates.splice(0)) {
          await this.peer.addIceCandidate(candidate);
        }
      } else if (message.type === "candidate") {
        if (this.peer.remoteDescription) {
          await this.peer.addIceCandidate(message.candidate);
        } else {
          this.pendingCandidates.push(message.candidate);
        }
      }
    }

    stop() {
      this.running = false;
      this.peer?.close();
      this.peer = null;
      this.roomId = null;
      this.lastSignalAt = 0;
      this.pendingCandidates = [];
    }
  }

  global.RemoteCameraReceiver = RemoteCameraReceiver;
})(window);
