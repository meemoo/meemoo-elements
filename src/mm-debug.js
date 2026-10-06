import htmlElements from "./html-elements.js";

const SVG = "http://www.w3.org/2000/svg";

function formatValue(value, nested) {
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value instanceof Element) return `<${value.localName}>`;
  if (value && typeof value === "object") {
    if (nested) return "{…}";
    const entries = Object.entries(value).map(
      ([key, val]) => `${key}: ${formatValue(val, true)}`
    );
    return `{${entries.join(", ")}}`;
  }
  return String(value);
}

// The element as HTML source, without the ">" of the opening tag.
// Attributes that show as field lines are left out.
function tagSource(el, manifest) {
  const linked = new Set(
    ((manifest && manifest.attributes) || [])
      .filter((attribute) => attribute.fieldName)
      .map((attribute) => attribute.name)
  );
  let open = "<" + el.localName;
  for (const { name, value } of el.attributes) {
    if (linked.has(name)) continue;
    open += value === "" ? ` ${name}` : ` ${name}="${value}"`;
  }
  const close = `</${el.localName}>`;
  return { open, close: el.outerHTML.endsWith(close) ? close : "" };
}

// "a" | "b" => ["a", "b"]
function unionOptions(typeText) {
  const parts = typeText.split("|").map((part) => part.trim());
  if (parts.length < 2) return null;
  const options = [];
  for (const part of parts) {
    const match = part.match(/^(["'])(.*)\1$/);
    if (!match) return null;
    options.push({ label: match[2], value: match[2] });
  }
  return options;
}

export class MmDebug extends HTMLElement {
  static mmManifest = () =>
    import("./mm-debug.manifest.js").then((m) => m.default);

  constructor() {
    super();

    const mountQuery = this.getAttribute("mount");
    if (mountQuery) {
      this.mountEl = document.querySelector(mountQuery);
    }
    this._abort = null;
    this._inspectors = [];
    // element => { manifest, tag, in: Map(name => el), out: Map(name => el) }
    this._ports = new WeakMap();
    this._wirePaths = new Map();
    this._wiresEl = null;
  }

  static get observedAttributes() {
    return ["hidden"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "hidden") this.hidden = newValue !== null;
  }

  set hidden(val) {
    this._hidden = Boolean(val);
    for (const el of this._inspectors) {
      el.style.display = this._hidden ? "none" : "block";
    }
    if (this._wiresEl) {
      this._wiresEl.style.display = this._hidden ? "none" : "block";
    }
  }
  get hidden() {
    return Boolean(this._hidden);
  }

  connectedCallback() {
    const { signal } = (this._abort = new AbortController());

    // Wait for child custom elements load
    const undefinedElements = this.querySelectorAll(":not(:defined)");
    const definedPromises = [...undefinedElements].map((el) =>
      customElements.whenDefined(el.localName)
    );
    const allElements = this.hasAttribute("shallow")
      ? this.children
      : this.querySelectorAll("*");

    Promise.all(definedPromises).then(async () => {
      const wired = new Set();
      for (const wire of this.querySelectorAll("mm-wire")) {
        wired.add(wire.getAttribute("from")).add(wire.getAttribute("to"));
      }
      // Custom elements with a manifest, known HTML elements, wire ends.
      const inspected = [...allElements].filter(
        (el) =>
          typeof el.constructor.mmManifest === "function" ||
          htmlElements[el.localName] ||
          (el.id && wired.has(el.id))
      );

      // Elements whose closing tag comes after their inspected descendants.
      const open = [];
      // mm-graph's children are not indented.
      const depth = () =>
        open.filter((el) => el.localName !== "mm-graph").length;
      const closeUntil = (el) => {
        while (open.length && !(el && open.at(-1).contains(el))) {
          const closed = open.pop();
          const lineEl = document.createElement("div");
          lineEl.className = "mm-debug--line mm-debug--tag";
          lineEl.textContent = `</${closed.localName}>`;
          this.addInspector(depth(), closed).appendChild(lineEl);
        }
      };

      for (const mmChild of inspected) {
        let manifest = htmlElements[mmChild.localName] || null;
        if (typeof mmChild.constructor.mmManifest === "function") {
          manifest = await mmChild.constructor.mmManifest();
          if (signal.aborted) return;
        }
        if (this.mountEl) closeUntil(mmChild);
        const isParent =
          Boolean(this.mountEl) &&
          inspected.some((el) => el !== mmChild && mmChild.contains(el));
        const inspectEl = this.addInspector(depth(), mmChild);
        this.mountInspector(mmChild, inspectEl, manifest, signal, isParent);
        if (isParent) open.push(mmChild);
      }
      closeUntil(null);
    });

    // Wires draw behind the inspectors.
    this._wiresEl = document.createElementNS(SVG, "svg");
    this._wiresEl.setAttribute("class", "mm-debug--wires");
    this._wiresEl.style.cssText =
      "position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none";
    this._wiresEl.style.display = this._hidden ? "none" : "block";
    if (this.mountEl) {
      this.mountEl.before(this._wiresEl);
    } else {
      this.prepend(this._wiresEl);
    }
    const draw = () => {
      if (signal.aborted) return;
      this.drawWires();
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  disconnectedCallback() {
    if (this._abort) this._abort.abort();
    for (const el of this._inspectors) el.remove();
    this._inspectors = [];
    if (this._wiresEl) this._wiresEl.remove();
    this._wiresEl = null;
    this._wirePaths.clear();
  }

  addInspector(depth, mmChild) {
    const el = document.createElement("div");
    el.className = "mm-debug";
    el.style.display = this._hidden ? "none" : "block";
    el.style.marginLeft = depth * 2 + "ch";
    const inspectEl = document.createElement("div");
    inspectEl.className = "mm-debug--inspect";
    el.appendChild(inspectEl);
    this._inspectors.push(el);

    if (this.mountEl) {
      this.mountEl.appendChild(el);
    } else {
      el.style.position = "relative";
      mmChild.after(el);
    }
    return inspectEl;
  }

  // Where a wire attaches: the port's line in the inspector.
  // In-ports on the left, out-ports on the right.
  portAnchor(el, direction, name) {
    const ports = this._ports.get(el);
    const manifest = ports && ports.manifest;
    let known = true;
    if (manifest) {
      known =
        direction === "out"
          ? (manifest.events || []).some((event) => event.name === name)
          : (manifest.members || []).some(
              (member) => member.name === name && !member.readonly
            );
    }
    const anchorEl = ports ? ports[direction].get(name) || ports.tag : el;
    const rect = anchorEl.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    let x = direction === "out" ? rect.right + 6 : rect.left - 6;
    let y = rect.top + rect.height / 2;
    if (this.mountEl && this.mountEl.contains(anchorEl)) {
      // On the panel's edge, so the dots peek out.
      const clip = this.mountEl.getBoundingClientRect();
      x = direction === "out" ? clip.right : clip.left;
      y = Math.min(Math.max(y, clip.top), clip.bottom);
    }
    return { x, y, known };
  }

  drawWires() {
    const wires = new Set(this.querySelectorAll("mm-wire"));
    for (const [wire, group] of this._wirePaths) {
      if (!wires.has(wire)) {
        group.remove();
        this._wirePaths.delete(wire);
      }
    }
    for (const wire of wires) {
      let group = this._wirePaths.get(wire);
      if (!group) {
        group = document.createElementNS(SVG, "g");
        group.setAttribute("color", "seagreen");
        group.setAttribute("fill", "none");
        group.setAttribute("stroke", "currentColor");
        group.setAttribute("stroke-width", "3");
        group.setAttribute("stroke-linecap", "round");
        // Hollow dot at the output, solid dot at the input.
        group.innerHTML =
          "<path/><circle r='4' fill='white'/><circle r='4' fill='currentColor'/>";
        this._wiresEl.appendChild(group);
        this._wirePaths.set(wire, group);
      }

      const root = wire.getRootNode();
      const find = (id) => id && root.querySelector("#" + CSS.escape(id));
      const source = find(wire.getAttribute("from"));
      const target = find(wire.getAttribute("to"));
      const a =
        source && this.portAnchor(source, "out", wire.getAttribute("out"));
      const b =
        target && this.portAnchor(target, "in", wire.getAttribute("in"));
      if (!a || !b) {
        group.style.display = "none";
        continue;
      }
      group.style.display = "";

      const known = a.known && b.known;
      group.setAttribute(
        "class",
        "mm-debug--wire" + (known ? "" : " mm-debug--wire-unknown")
      );
      group.setAttribute("stroke-dasharray", known ? "none" : "2 6");

      // Far enough out that the wire shows beside the panel.
      const bend =
        Math.min(160, Math.max(60, Math.abs(b.y - a.y) * 0.6)) +
        Math.abs(b.x - a.x) * 0.2;
      const d = `M${a.x},${a.y} C${a.x + bend},${a.y} ${b.x - bend},${b.y} ${b.x},${b.y}`;
      const [path, start, end] = group.children;
      if (path.getAttribute("d") !== d) {
        path.setAttribute("d", d);
        start.setAttribute("cx", a.x);
        start.setAttribute("cy", a.y);
        end.setAttribute("cx", b.x);
        end.setAttribute("cy", b.y);
      }
    }
  }

  // Renders the element like its HTML source, one port per line:
  //   attr="…" for fields with an attribute, .prop for other fields,
  //   method() and @event.
  mountInspector(mmChild, inspectEl, manifest, signal, isParent) {
    inspectEl.innerHTML = "";

    // Built-in elements stay on one line; their ports attach to it.
    const builtIn = manifest && manifest === htmlElements[mmChild.localName];
    const { members = [], events = [] } = (!builtIn && manifest) || {};
    const attributes = (manifest && manifest.attributes) || [];
    const { open, close } = tagSource(mmChild, manifest);

    const updaters = [];
    const refresh = () => updaters.forEach((update) => update());

    const addLine = (className, tag = "div") => {
      const lineEl = document.createElement(tag);
      lineEl.className = "mm-debug--line " + className;
      lineEl.style.display = "block";
      inspectEl.appendChild(lineEl);
      return lineEl;
    };
    const addPortLine = (className, tag) => {
      const lineEl = addLine(className, tag);
      lineEl.style.paddingLeft = "2ch";
      return lineEl;
    };

    const tagEl = addLine("mm-debug--tag");
    tagEl.textContent = open;
    const ports = { manifest, tag: tagEl, in: new Map(), out: new Map() };
    this._ports.set(mmChild, ports);

    const fieldLabel = (name) => {
      const attribute = attributes.find((attr) => attr.fieldName === name);
      return attribute ? attribute.name : "." + name;
    };

    const addControl = (name, controlEl, quoted) => {
      const lineEl = addPortLine("mm-debug--label", "label");
      lineEl.append(fieldLabel(name) + (quoted ? '="' : " "), controlEl);
      if (quoted) lineEl.append('"');
      ports.in.set(name, lineEl);
    };

    const addInput = (name, type, className, mm = {}) => {
      const inputEl = document.createElement("input");
      inputEl.className = className;
      inputEl.type = type;
      for (const key of ["min", "max", "step"]) {
        if (mm[key] !== undefined) inputEl[key] = mm[key];
      }
      const prop = type === "checkbox" ? "checked" : "value";
      inputEl.addEventListener("change", () => {
        mmChild[name] =
          type === "number" ? inputEl.valueAsNumber : inputEl[prop];
      });
      updaters.push(() => {
        if (document.activeElement === inputEl) return;
        const value = mmChild[name];
        inputEl[prop] = type === "checkbox" ? Boolean(value) : (value ?? "");
      });
      addControl(name, inputEl, type !== "checkbox");
    };

    const addSelect = (name, getOptions) => {
      const selectEl = document.createElement("select");
      selectEl.className = "mm-debug--select";
      selectEl.title = name;
      selectEl.addEventListener("change", () => {
        mmChild[name] = selectEl.value;
      });
      let lastOptions = "";
      updaters.push(() => {
        const options = getOptions() || [];
        const json = JSON.stringify(options);
        if (json !== lastOptions) {
          lastOptions = json;
          selectEl.innerHTML = "";
          for (let { label, value } of options) {
            const optionEl = document.createElement("option");
            optionEl.value = value;
            optionEl.textContent = label || value;
            selectEl.appendChild(optionEl);
          }
        }
        if (document.activeElement !== selectEl) {
          selectEl.value = mmChild[name] ?? "";
        }
      });
      addControl(name, selectEl, true);
    };

    for (let member of members) {
      const { kind, name, readonly, parameters = [], mm = {} } = member;
      const type = member.type ? member.type.text : "";

      if (kind === "method") {
        const lineEl = addPortLine("mm-debug--method");
        ports.in.set(name, lineEl);
        if (parameters.some((param) => !param.optional)) {
          // Can't be called from here, but wires can attach to it.
          const names = parameters.map((param) => param.name).join(", ");
          lineEl.textContent = `${name}(${names})`;
          continue;
        }
        const buttonEl = document.createElement("button");
        buttonEl.className = "mm-debug--button";
        buttonEl.innerText = name + "()";
        buttonEl.addEventListener("click", () => {
          mmChild[name]();
          refresh();
        });
        lineEl.appendChild(buttonEl);
      }

      if (kind === "field") {
        const options = unionOptions(type);
        if (readonly) {
          const valueEl = document.createElement("span");
          valueEl.className = "mm-debug--value";
          updaters.push(() => {
            valueEl.textContent = formatValue(mmChild[name]);
          });
          addPortLine("mm-debug--readonly").append(
            fieldLabel(name) + "=",
            valueEl
          );
        } else if (mm.optionsFrom) {
          addSelect(name, () => mmChild[mm.optionsFrom]);
        } else if (options) {
          addSelect(name, () => options);
        } else if (type === "boolean") {
          addInput(name, "checkbox", "mm-debug--checkbox");
        } else if (type === "number") {
          addInput(name, "number", "mm-debug--number", mm);
        } else if (type === "string") {
          addInput(name, "text", "mm-debug--text");
        }
      }
    }

    for (let event of events) {
      const countEl = document.createElement("span");
      countEl.className = "mm-debug--count";
      countEl.textContent = "0";
      const lineEl = addPortLine("mm-debug--event");
      lineEl.append("@" + event.name + " ", countEl);
      ports.out.set(event.name, lineEl);
      let count = 0;
      mmChild.addEventListener(
        event.name,
        () => {
          countEl.textContent = String(++count);
          refresh();
        },
        { signal }
      );
    }

    // End of the opening tag, then text and closing tag.
    const single = inspectEl.children.length === 1;
    const endEl = single ? tagEl : addLine("mm-debug--tag");
    endEl.append(">");
    const text = mmChild.textContent.trim();
    if (mmChild.localName === "button") {
      // Stands in for the real button.
      const buttonEl = document.createElement("button");
      buttonEl.className = "mm-debug--button";
      buttonEl.textContent = text;
      buttonEl.addEventListener("click", () => mmChild.click());
      endEl.append(buttonEl);
    } else if (!mmChild.children.length && text.length <= 40) {
      endEl.append(text);
    }
    if (!isParent) endEl.append(close);

    refresh();
  }
}

customElements.define("mm-debug", MmDebug);
