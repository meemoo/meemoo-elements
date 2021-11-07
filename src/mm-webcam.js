const template = document.createElement("template");
template.innerHTML = `
  <video class="mm-webcam-video" autoplay></video>
`;

class MmWebcam extends HTMLElement {
  constructor() {
    super();
  }

  static get observedAttributes() {
    return ["camId"];
  }

  set camId(val) {
    this.__camId = val;
    if (this.stream) {
      this.start();
    }
  }
  get camId() {
    return this.__camId;
  }

  mmManifest() {
    return {
      name: "MmWebcam",
      tag: "mm-webcam",
      members: [
        { kind: "method", name: "start" },
        { kind: "method", name: "stop" },
        { kind: "field", name: "camId", options: this.camInfo },
      ],
    };
  }

  mmManifestChanged() {
    this.dispatchEvent(new Event("mm-manifest-changed"));
  }

  connectedCallback() {
    this.appendChild(template.content.cloneNode(true));
    this.videoEl = this.querySelector(".mm-webcam-video");

    this.__camId = null;
    this.camInfo = [];

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
          this.camInfo = camInfo;
          this.mmManifestChanged();
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
        video: this.__camId ? { deviceId: this.__camId } : true,
        audio: false,
      })
      .then((mediaStream) => {
        this.stream = mediaStream;
        try {
          this.videoEl.srcObject = this.stream;
        } catch (error) {
          this.videoEl.src = URL.createObjectURL(this.stream);
        }
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
