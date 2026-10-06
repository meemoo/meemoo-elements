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

const camelCase = (name) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase());

function eventValue(event, source) {
  if (event instanceof CustomEvent) {
    return event.detail === null ? undefined : event.detail;
  }
  if (event.type === "change" || event.type === "input") {
    if (source.type === "checkbox" || source.type === "radio") {
      return source.checked;
    }
    if (source.type === "number" || source.type === "range") {
      return source.valueAsNumber;
    }
    return source.value;
  }
  const changed = event.type.match(/^(.+)-changed$/);
  if (changed) return source[camelCase(changed[1])];
  // Other native events are bangs. (Native click's detail is a click count.)
  return undefined;
}

export class MmWire extends HTMLElement {
  static mmManifest = manifest(1);

  static get observedAttributes() {
    return wireAttributes;
  }

  connectedCallback() {
    this._connect();
  }

  disconnectedCallback() {
    this._disconnect();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._connect();
  }

  _disconnect() {
    if (this._abort) this._abort.abort();
    this._abort = null;
  }

  async _connect() {
    this._disconnect();
    const { signal } = (this._abort = new AbortController());

    const [fromId, out, toId, inName] = wireAttributes.map((name) =>
      this.getAttribute(name)
    );
    if (!fromId || !out || !toId || !inName) return;

    if (document.readyState === "loading") {
      await new Promise((resolve) =>
        document.addEventListener("DOMContentLoaded", resolve, { once: true })
      );
      if (signal.aborted) return;
    }

    const root = this.getRootNode();
    const find = (id) => root.querySelector("#" + CSS.escape(id));
    const source = find(fromId);
    const target = find(toId);
    if (!source || !target) {
      console.warn("mm-wire: endpoint not found", this);
      return;
    }

    for (const el of [source, target]) {
      if (el.localName.includes("-")) {
        await customElements.whenDefined(el.localName);
      }
    }
    if (signal.aborted) return;

    const send = (value) => {
      if (typeof target[inName] === "function") {
        target[inName](value);
      } else if (value !== undefined) {
        target[inName] = value;
      }
    };

    source.addEventListener(out, (event) => send(eventValue(event, source)), {
      signal,
    });

    // Late connection: send the custom element's current value, if it has one.
    if (source.localName.includes("-")) {
      const current = source[out];
      if (current != null && typeof current !== "function") send(current);
    }
  }
}

for (const name of wireAttributes) {
  Object.defineProperty(MmWire.prototype, name, {
    get() {
      return this.getAttribute(name);
    },
    set(val) {
      this.setAttribute(name, val);
    },
  });
}

customElements.define("mm-wire", MmWire);
customElements.define("mm-graph", MmGraph);
