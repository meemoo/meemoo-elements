// A deliberately small DOM shim for protocol/resource tests, not layout tests.
export function installDOM() {
  const definitions = new Map();
  const waiting = new Map();
  class Element extends EventTarget {
    constructor() {
      super();
      this.localName = "";
      this.isConnected = false;
      this.attributes = new Map();
      this.children = [];
      this.parentElement = null;
    }
    get id() { return this.getAttribute("id") || ""; }
    set id(value) { this.setAttribute("id", value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    setAttribute(name, value) {
      const old = this.getAttribute(name);
      this.attributes.set(name, String(value));
      if (this.constructor.observedAttributes?.includes(name)) {
        this.attributeChangedCallback(name, old, String(value));
      }
    }
    removeAttribute(name) {
      const old = this.getAttribute(name);
      if (old === null) return;
      this.attributes.delete(name);
      if (this.constructor.observedAttributes?.includes(name)) {
        this.attributeChangedCallback(name, old, null);
      }
    }
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
    closest(name) {
      for (let el = this; el; el = el.parentElement) {
        if (el.localName === name) return el;
      }
      return null;
    }
    getRootNode() {
      return this.parentElement ? this.parentElement.getRootNode() : this;
    }
    querySelectorAll(selector) {
      const descendants = this.children.flatMap(
        (child) => [child, ...child.querySelectorAll("*")]
      );
      if (selector === "*") return descendants;
      if (selector.startsWith("#")) {
        return descendants.filter((child) => child.id === selector.slice(1));
      }
      if (selector.startsWith(".")) {
        return descendants.filter((child) => child.className === selector.slice(1));
      }
      return descendants.filter((child) => child.localName === selector);
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
  }
  globalThis.HTMLElement = Element;
  globalThis.Element = Element;
  globalThis.customElements = {
    define(name, constructor) {
      definitions.set(name, constructor);
      waiting.get(name)?.forEach((resolve) => resolve(constructor));
      waiting.delete(name);
    },
    get: (name) => definitions.get(name),
    whenDefined(name) {
      if (definitions.has(name)) return Promise.resolve(definitions.get(name));
      return new Promise((resolve) => {
        waiting.set(name, [...(waiting.get(name) || []), resolve]);
      });
    },
  };
  globalThis.document = new Element();
  document.readyState = "complete";
  document.baseURI = "https://example.test/";
  document.createElement = (name) => {
    const el = new Element();
    el.localName = name;
    if (name === "template") el.content = {
      cloneNode() {
        const video = new Element();
        video.localName = "video";
        video.className = "mm-webcam--video";
        video.srcObject = null;
        return video;
      },
    };
    return el;
  };
  globalThis.CSS = { escape: (value) => value };
  globalThis.requestAnimationFrame = () => 1;
  return { element: (name) => document.createElement(name) };
}
