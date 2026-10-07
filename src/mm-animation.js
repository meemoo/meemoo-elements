const childTemplate = document.createElement("template");
childTemplate.innerHTML = `
  <canvas class="mm-animation--canvas" width="0" height="0"></canvas>
`;

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
    this.canvasEl = null;
    this._index = 0;
    this._loop = 0;
    this._lastFrame = 0;
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

  connectedCallback() {
    if (!this.canvasEl) {
      this.appendChild(childTemplate.content.cloneNode(true));
      this.canvasEl = this.querySelector(".mm-animation--canvas");
    }
    this._draw();
    this._startLoop();
  }

  disconnectedCallback() {
    this._loop++;
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
    // Paused: there is no playback to reveal the new frame, so show it now.
    if (!(this._animation.fps > 0)) {
      this._index = this._animation.frames.length - 1;
      this._draw();
    }
    this.send();
  }

  clear() {
    this._animation.frames.length = 0;
    this._index = 0;
    this._draw();
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
    if (extra > 0) {
      frames.splice(0, extra);
      // Keep pointing at the same frame as the front of the list drops off.
      this._index = Math.max(0, this._index - extra);
    }
    return extra > 0;
  }

  _draw() {
    const canvas = this.canvasEl;
    if (!canvas) return;
    const { width, height, frames } = this._animation;
    if (!frames.length) {
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    // Setting the size clears the canvas, so only do it on change.
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    this._index %= frames.length;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, width, height);
    context.drawImage(frames[this._index], 0, 0, width, height);
  }

  _startLoop() {
    const loop = ++this._loop;
    this._lastFrame = 0;
    const onFrame = (now) => {
      if (loop !== this._loop) return;
      const { fps, frames } = this._animation;
      if (fps > 0 && frames.length) {
        const interval = 1000 / fps;
        const elapsed = now - this._lastFrame;
        if (elapsed >= interval) {
          // Step from the ideal time so the rate doesn't drift, but don't
          // try to catch up after a long pause (hidden tab, empty animation).
          this._lastFrame =
            elapsed >= interval * 2 ? now : this._lastFrame + interval;
          this._index = (this._index + 1) % frames.length;
          this._draw();
        }
      }
      requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);
  }
}

customElements.define("mm-animation", MmAnimation);
