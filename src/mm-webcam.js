const childTemplate = document.createElement("template");
childTemplate.innerHTML = `
  <video class="mm-webcam--video" autoplay playsinline></video>
`;

export class MmWebcam extends HTMLElement {
  static mmManifest = () =>
    import("./mm-webcam.manifest.js").then((m) => m.default);

  static get observedAttributes() {
    return ["cam-id", "fps"];
  }

  constructor() {
    super();

    this.videoEl = null;
    this.stream = null;
    this.frameRate = 30;
    this._camId = null;
    this._cameras = [];
    this._fps = 30;
    this._loop = 0;
    this._lastFrame = 0;
    this._generation = 0;
    this._starting = false;
    this._streamUrl = null;
  }

  set camId(val) {
    this._camId = val ? val : null;
    if (this.stream || this._starting) {
      if (this._camId) {
        this.start().catch((error) => this._reportError(error));
      } else {
        this.stop();
      }
    }
  }
  get camId() {
    return this._camId;
  }

  set fps(val) {
    this._fps = Number(val) || 0;
  }
  get fps() {
    return this._fps;
  }

  get cameras() {
    return this._cameras;
  }

  get currentTime() {
    if (this.videoEl) {
      return this.videoEl.currentTime;
    }
    return null;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "cam-id") this.camId = newValue;
    if (name === "fps") this.fps = newValue;
  }

  connectedCallback() {
    if (!this.videoEl) {
      this.appendChild(childTemplate.content.cloneNode(true));
      this.videoEl = this.querySelector(".mm-webcam--video");
      this.videoEl.addEventListener("play", () =>
        this.dispatchEvent(new Event("mm-webcam-start"))
      );
    }
    // Will only succeed if permission was previously given and remembered
    this.enumerateDevices();
  }

  disconnectedCallback() {
    this.stop();
  }

  async enumerateDevices() {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = [];
        for (let device of devices) {
          const { kind, label, deviceId } = device;
          if (kind === "videoinput") {
            cameras.push({ label, value: deviceId });
          }
        }
        this._cameras = cameras;
        this.dispatchEvent(new CustomEvent("cameras", { detail: cameras }));
      } catch (error) {
        this._reportError(error);
      }
    }
  }

  async start() {
    this.stop();
    const generation = this._generation;
    this._starting = true;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: this._camId ? { deviceId: this._camId } : true,
        audio: false,
      });
      if (generation !== this._generation) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return undefined;
      }
      this.stream = mediaStream;

      this.stream.getVideoTracks().forEach((track) => {
        const mediaTrackSettings = track.getSettings();
        this.frameRate = mediaTrackSettings.frameRate;
        if (!this._camId) {
          this._camId = mediaTrackSettings.deviceId;
        }
      });

      try {
        this.videoEl.srcObject = this.stream;
      } catch (error) {
        this._streamUrl = URL.createObjectURL(this.stream);
        this.videoEl.src = this._streamUrl;
      }
      this._startLoop();
      this._starting = false;
      // We can only list devices after permission to connect
      this.enumerateDevices();
      return mediaStream;
    } catch (error) {
      if (generation !== this._generation) return undefined;
      this.stop();
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  stop() {
    this._generation++;
    this._starting = false;
    this._loop++;
    const stream = this.stream;
    this.stream = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (this.videoEl) {
      if (!this._streamUrl) this.videoEl.srcObject = null;
      this.videoEl.removeAttribute("src");
    }
    if (this._streamUrl) {
      URL.revokeObjectURL(this._streamUrl);
      this._streamUrl = null;
    }
  }

  _reportError(error) {
    this.dispatchEvent(
      new CustomEvent("error", {
        detail: error instanceof Error ? error : new Error(String(error)),
      })
    );
  }

  send() {
    if (this.videoEl && this.videoEl.videoWidth) {
      this.dispatchEvent(new CustomEvent("image", { detail: this.videoEl }));
    }
  }

  _startLoop() {
    const loop = ++this._loop;
    const video = this.videoEl;
    const schedule = () => {
      if (video.requestVideoFrameCallback) {
        video.requestVideoFrameCallback(onFrame);
      } else {
        requestAnimationFrame(onFrame);
      }
    };
    const onFrame = (now) => {
      if (loop !== this._loop) return;
      if (
        this._fps > 0 &&
        video.videoWidth &&
        now - this._lastFrame >= 1000 / this._fps - 5
      ) {
        this._lastFrame = now;
        this.dispatchEvent(new CustomEvent("stream", { detail: video }));
      }
      schedule();
    };
    schedule();
  }
}

customElements.define("mm-webcam", MmWebcam);
