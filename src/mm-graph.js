import htmlElements from "./html-elements.js";

const manifest = (index) => () =>
  import("./mm-graph.manifest.js").then((m) => m.default[index]);

export class MmGraph extends HTMLElement {
  static mmManifest = manifest(0);

  async connectedCallback() {
    const src = this.getAttribute("src");
    if (src && this._src !== src) {
      this._src = src;
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(response.status);
        this.innerHTML = await response.text();
      } catch (error) {
        console.warn("mm-graph: could not load", src, error);
      }
    }
    this.loadModules();
  }

  loadModules() {
    const urls = new Set();
    for (const url of (this.getAttribute("modules") || "").split(/\s+/)) {
      if (url) urls.add(new URL(url, document.baseURI).href);
    }
    for (const el of this.querySelectorAll(":not(:defined)")) {
      if (el.localName.startsWith("mm-")) {
        urls.add(new URL(`./${el.localName}.js`, import.meta.url).href);
      }
    }
    return Promise.all(
      [...urls].map((url) =>
        import(url).catch((error) =>
          console.warn("mm-graph: could not import", url, error)
        )
      )
    );
  }
}

const wireAttributes = ["from", "out", "to", "in"];

async function elementManifest(el) {
  return typeof el.constructor.mmManifest === "function"
    ? el.constructor.mmManifest()
    : htmlElements[el.localName];
}

function eventValue(event, source, output) {
  if (output.mm?.kind === "state") return source[output.mm.property];
  if (output.mm?.adapter === "value") {
    if (source.type === "checkbox" || source.type === "radio") {
      return source.checked;
    }
    if (source.type === "number" || source.type === "range") {
      return source.valueAsNumber;
    }
    return source.value;
  }
  if (!(event instanceof CustomEvent)) {
    throw new Error(`Message output "${output.name}" must emit a CustomEvent`);
  }
  return event.detail;
}

export class MmWire extends HTMLElement {
  static mmManifest = manifest(1);

  static get observedAttributes() {
    return [...wireAttributes, "disabled"];
  }

  get status() {
    return this._status || "disconnected";
  }

  get reason() {
    return this._reason || "";
  }

  get error() {
    return this._error || null;
  }

  get source() {
    return this._source || null;
  }

  get target() {
    return this._target || null;
  }

  connectedCallback() {
    this.connect();
  }

  disconnectedCallback() {
    this._disconnect();
    this._setStatus("disconnected", "detached");
  }

  attributeChangedCallback() {
    if (this.isConnected) this.connect();
  }

  _setStatus(status, reason = "", error = null) {
    if (
      status === this.status &&
      reason === this.reason &&
      error === this.error
    ) return;
    this._status = status;
    this._reason = reason;
    this._error = error;
    this.dispatchEvent(
      new CustomEvent("wire-status", { detail: { status, reason, error } })
    );
  }

  _disconnect() {
    if (this._abort) this._abort.abort();
    this._abort = null;
    this._source = null;
    this._target = null;
  }

  // Also the explicit retry point after adding/replacing an endpoint.
  async connect() {
    this._disconnect();
    if (!this.isConnected) {
      this._setStatus("disconnected", "detached");
      return;
    }
    const { signal } = (this._abort = new AbortController());

    const [fromId, out, toId, inName] = wireAttributes.map((name) =>
      this.getAttribute(name)
    );
    if (this.hasAttribute("disabled")) {
      this._setStatus("disconnected", "disabled");
      return;
    }
    this._setStatus("pending", "resolving");
    if (signal.aborted) return;

    try {
      if (document.readyState === "loading") {
        this._setStatus("pending", "awaiting-document");
        await new Promise((resolve) => {
          document.addEventListener("DOMContentLoaded", resolve, {
            once: true,
            signal,
          });
          signal.addEventListener("abort", resolve, { once: true });
        });
        if (signal.aborted) return;
      }

      const graph = this.closest("mm-graph");
      const root = graph || this.getRootNode();
      const find = (id) =>
        id && [...root.querySelectorAll("#" + CSS.escape(id))].find(
          (el) => !graph || el.closest("mm-graph") === graph
        );
      const source = (this._source = find(fromId) || null);
      const target = (this._target = find(toId) || null);
      if (!fromId || !out || !toId || !inName) {
        this._setStatus("pending", "incomplete");
        return;
      }
      if (!source || !target) {
        this._setStatus("pending", "awaiting-endpoint");
        return;
      }

      for (const el of [source, target]) {
        if (el.localName.includes("-") && !customElements.get(el.localName)) {
          this._setStatus("pending", "awaiting-definition");
          await customElements.whenDefined(el.localName);
          if (signal.aborted) return;
        }
      }
      const [sourceManifest, targetManifest] = await Promise.all([
        elementManifest(source),
        elementManifest(target),
      ]);
      if (signal.aborted) return;
      const output = sourceManifest?.events?.find((event) => event.name === out);
      const input = targetManifest?.members?.find((member) => member.name === inName);
      if (!output) throw new Error(`Unknown output "${out}"`);
      if (!input || input.readonly || !["field", "method"].includes(input.kind)) {
        throw new Error(`Unknown or readonly input "${inName}"`);
      }
      const kind = output.mm?.kind || "message";
      if (!["signal", "message", "state"].includes(kind)) {
        throw new Error(`Unknown output kind "${kind}"`);
      }
      if (kind === "state" && (
        !sourceManifest.members?.some(
          (member) => member.kind === "field" && member.name === output.mm.property
        ) || !(output.mm.property in source)
      )) {
        throw new Error(`State output "${out}" needs a declared readable property`);
      }
      if (input.kind === "method") {
        const parameters = input.parameters || [];
        if (
          typeof target[inName] !== "function" ||
          parameters.length > 1 ||
          (kind === "signal" && parameters.some((param) => !param.optional)) ||
          (kind !== "signal" && !parameters.length)
        ) throw new Error(`Unsupported method input "${inName}" for ${kind}`);
      } else if (kind === "signal" || !(inName in target)) {
        throw new Error(`Input "${inName}" needs a value and an existing property`);
      }

      const fail = (error) => {
        if (signal.aborted) return;
        this._abort.abort();
        this._setStatus("error", "delivery-failed", error);
      };
      const deliver = (event) => {
        if (signal.aborted) return;
        try {
          const value = kind === "signal" ? undefined : eventValue(event, source, output);
          const result = input.kind === "method"
            ? kind === "signal" ? target[inName]() : target[inName](value)
            : (target[inName] = value);
          if (input.kind === "method") Promise.resolve(result).catch(fail);
        } catch (error) {
          fail(error);
        }
      };
      source.addEventListener(out, deliver, { signal });
      this._setStatus("connected");
      // Only declared state outputs synchronize on connection.
      if (kind === "state") deliver();
    } catch (error) {
      if (!signal.aborted) {
        this._abort.abort();
        this._setStatus("error", "invalid-connection", error);
      }
    }
  }
}

for (const name of wireAttributes) {
  Object.defineProperty(MmWire.prototype, name, {
    get() {
      return this.getAttribute(name);
    },
    set(val) {
      if (val == null) this.removeAttribute(name);
      else this.setAttribute(name, val);
    },
  });
}

customElements.define("mm-wire", MmWire);
customElements.define("mm-graph", MmGraph);
