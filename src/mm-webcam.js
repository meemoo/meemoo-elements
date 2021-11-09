const childTemplate = document.createElement("template");
childTemplate.innerHTML = `
  <video class="mm-webcam--video" autoplay></video>
`;

class MmWebcam extends HTMLElement {
  constructor() {
    super();

    this.videoEl = null;
    this.stream = null;
    this._camId = null;
    this._camInfo = [];
    this._lastTimeUpdate = -1;
    this.frameRate = 30;
  }

  static get observedAttributes() {
    return ["camId"];
  }

  set camId(val) {
    this._camId = val ? val : null;
    if (this.stream) {
      if (this._camId) {
        this.start();
      } else {
        this.stop();
      }
    }
  }
  get camId() {
    return this._camId;
  }

  get currentTime() {
    if (this.videoEl) {
      return this.videoEl.currentTime;
    }
    return null;
  }

  mmManifest() {
    return {
      name: "MmWebcam",
      tagName: "mm-webcam",
      members: [
        { kind: "method", name: "start" },
        { kind: "method", name: "stop" },
        { kind: "field", name: "camId", options: this._camInfo },
        // Idea to wire directly to member el events, without translation
        { kind: "field", name: "videoEl", type: "HTMLVideoElement" },
        // Read-only members?
        { kind: "field", name: "frameRate", type: "number" },
      ],
      // events: [
      //   {
      //     name: "mm-webcam-start",
      //     description:
      //       "fired when permission is granted and webcam stream starts",
      //   },
      // ],
    };
  }

  _mmManifestChanged() {
    this.dispatchEvent(new Event("mm-manifest-changed"));
  }

  connectedCallback() {
    this.appendChild(childTemplate.content.cloneNode(true));
    this.videoEl = this.querySelector(".mm-webcam--video");
    this.videoEl.addEventListener("play", () =>
      this.dispatchEvent(new Event("mm-webcam-start"))
    );
    // Will only succeed if permission was previously given and remembered
    this.enumerateDevices();
  }

  disconnectedCallback() {
    this.stop();
  }

  enumerateDevices() {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const camInfo = [];
          for (let device of devices) {
            const { kind, label, deviceId } = device;
            if (kind === "videoinput") {
              camInfo.push({ label, value: deviceId });
            }
          }
          this._camInfo = camInfo;
          this._mmManifestChanged();
        })
        .catch(() => {});
    }
  }

  start() {
    if (this.stream) {
      this.stop();
    }
    navigator.mediaDevices
      .getUserMedia({
        video: this._camId ? { deviceId: this._camId } : true,
        audio: false,
      })
      .then((mediaStream) => {
        this.stream = mediaStream;

        this.stream.getVideoTracks().forEach((track) => {
          const mediaTrackSettings = track.getSettings();
          this.frameRate = mediaTrackSettings.frameRate;
          if (!this._camId) {
            // So mm-debug can show the correct one selected
            this._camId = mediaTrackSettings.deviceId;
            this._mmManifestChanged();
          }
        });

        try {
          this.videoEl.srcObject = this.stream;
        } catch (error) {
          this.videoEl.src = URL.createObjectURL(this.stream);
        }
        // We can only list devices after permission to connect
        this.enumerateDevices();
      })
      .catch(() => {});
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
  }
}

customElements.define("mm-webcam", MmWebcam);
