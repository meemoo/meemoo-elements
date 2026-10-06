export class MmAnimation extends HTMLElement {
  static mmManifest = () =>
    import("./mm-animation.manifest.js").then((m) => m.default);

  static get observedAttributes() {
    return ["fps", "max-length"];
  }

  constructor() {
    super();
    this._animation = { width: 0, height: 0, fps: 12, frames: [] };
    this._maxLength = 0;
  }

  get animation() {
    return this._animation;
  }

  set fps(val) {
    this._animation.fps = Number(val) || 0;
  }
  get fps() {
    return this._animation.fps;
  }

  set maxLength(val) {
    this._maxLength = Math.max(0, Math.floor(Number(val) || 0));
    if (this._trim()) this.send();
  }
  get maxLength() {
    return this._maxLength;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "fps") this.fps = newValue === null ? 12 : newValue;
    if (name === "max-length") this.maxLength = newValue;
  }

  // Copies the image now; the source may be a live video or canvas.
  push(image) {
    if (!image) return;
    const width =
      image.videoWidth ||
      image.naturalWidth ||
      image.displayWidth ||
      image.width;
    const height =
      image.videoHeight ||
      image.naturalHeight ||
      image.displayHeight ||
      image.height;
    if (!width || !height) return;

    const frame = document.createElement("canvas");
    frame.width = width;
    frame.height = height;
    frame.getContext("2d").drawImage(image, 0, 0, width, height);

    this._animation.frames.push(frame);
    this._animation.width = width;
    this._animation.height = height;
    this._trim();
    this.send();
  }

  clear() {
    this._animation.frames.length = 0;
    this.send();
  }

  send() {
    this.dispatchEvent(
      new CustomEvent("animation", { detail: this._animation })
    );
  }

  _trim() {
    const { frames } = this._animation;
    const extra = this._maxLength ? frames.length - this._maxLength : 0;
    if (extra > 0) frames.splice(0, extra);
    return extra > 0;
  }
}

customElements.define("mm-animation", MmAnimation);
