import htmlElements from "./html-elements.js";

const SVG = "http://www.w3.org/2000/svg";

function formatValue(value, nested) {
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value instanceof Element) return `<${value.localName}>`;
  if (value instanceof Error) return value.message;
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

    this._abort = null;
    this._targetEl = null;
    this._inspectors = [];
    // element => { manifest, tag, in: Map(name => el), out: Map(name => el) }
    this._ports = new WeakMap();
    this._wirePaths = new Map();
    // port line => { direction, dot }
    this._portDots = new Map();
    this._wiresEl = null;
  }

  static get observedAttributes() {
    return ["for"];
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  connectedCallback() {
    this._render();
  }

  disconnectedCallback() {
    this._clear();
  }

  _clear() {
    if (this._abort) this._abort.abort();
    this._abort = null;
    this._targetEl = null;
    for (const el of this._inspectors) el.remove();
    this._inspectors = [];
    if (this._wiresEl) this._wiresEl.remove();
    this._wiresEl = null;
    this._wirePaths.clear();
    this._portDots.clear();
  }

  async _render() {
    this._clear();
    const { signal } = (this._abort = new AbortController());

    if (document.readyState === "loading") {
      await new Promise((resolve) =>
        document.addEventListener("DOMContentLoaded", resolve, { once: true })
      );
      if (signal.aborted) return;
    }

    const id = this.getAttribute("for");
    const target =
      id && this.getRootNode().querySelector("#" + CSS.escape(id));
    if (!target) {
      console.warn("mm-debug: target not found", this);
      return;
    }
    this._targetEl = target;

    // Wires draw behind the inspectors.
    this._wiresEl = document.createElementNS(SVG, "svg");
    this._wiresEl.setAttribute("class", "mm-debug--wires");
    this._wiresEl.style.cssText =
      "position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none";
    this.prepend(this._wiresEl);
    const draw = () => {
      if (signal.aborted) return;
      this.drawWires();
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);

    // Wait for custom elements load
    const undefinedElements = [
      target,
      ...target.querySelectorAll(":not(:defined)"),
    ].filter((el) => el.matches(":not(:defined)"));
    await Promise.all(
      undefinedElements.map((el) => customElements.whenDefined(el.localName))
    );
    if (signal.aborted) return;

    const allElements = [
      target,
      ...(this.hasAttribute("shallow")
        ? target.children
        : target.querySelectorAll("*")),
    ];
    const wired = new Set();
    for (const wire of target.querySelectorAll("mm-wire")) {
      wired.add(wire.getAttribute("from")).add(wire.getAttribute("to"));
    }
    // Custom elements with a manifest, known HTML elements, wire ends.
    const inspected = allElements.filter(
      (el) =>
        typeof el.constructor.mmManifest === "function" ||
        htmlElements[el.localName] ||
        (el.id && wired.has(el.id))
    );

    // Elements whose closing tag comes after their inspected descendants.
    const open = [];
    // mm-graph's children are not indented.
    const depth = () => open.filter((el) => el.localName !== "mm-graph").length;
    const closeUntil = (el) => {
      while (open.length && !(el && open.at(-1).contains(el))) {
        const closed = open.pop();
        const lineEl = document.createElement("div");
        lineEl.className = "mm-debug--line mm-debug--tag";
        lineEl.textContent = `</${closed.localName}>`;
        this.addInspector(depth()).appendChild(lineEl);
      }
    };

    for (const mmChild of inspected) {
      let manifest = htmlElements[mmChild.localName] || null;
      if (typeof mmChild.constructor.mmManifest === "function") {
        manifest = await mmChild.constructor.mmManifest();
        if (signal.aborted) return;
      }
      closeUntil(mmChild);
      const isParent = inspected.some(
        (el) => el !== mmChild && mmChild.contains(el)
      );
      const inspectEl = this.addInspector(depth());
      this.mountInspector(mmChild, inspectEl, manifest, signal, isParent);
      if (isParent) open.push(mmChild);
    }
    closeUntil(null);
  }

  addInspector(depth) {
    const el = document.createElement("div");
    el.className = "mm-debug";
    // Above the wires.
    el.style.position = "relative";
    el.style.marginLeft = depth * 2 + "ch";
    const inspectEl = document.createElement("div");
    inspectEl.className = "mm-debug--inspect";
    el.appendChild(inspectEl);
    this._inspectors.push(el);
    this.appendChild(el);
    return inspectEl;
  }

  // Where a wire attaches: the port's line in the inspector.
  // In-ports on the left, out-ports on the right.
  portAnchor(el, direction, name) {
    const ports = this._ports.get(el);
    const anchorEl = ports ? ports[direction].get(name) || ports.tag : el;
    const point = this.anchorPoint(anchorEl, direction);
    if (!point) return null;
    // The bottom of the element's inspector, where its out wires turn back.
    const blockEl = anchorEl.closest(".mm-debug") || anchorEl;
    const under = blockEl.getBoundingClientRect().bottom;
    return { ...point, under };
  }

  // Right-angle path through the points, with rounded corners.
  roundedPath(points, radius = 8) {
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const corner = points[i];
      const next = points[i + 1];
      const before = Math.hypot(corner.x - prev.x, corner.y - prev.y);
      const after = Math.hypot(next.x - corner.x, next.y - corner.y);
      const r = Math.min(radius, before / 2, after / 2);
      if (!r) continue;
      const fromX = corner.x - ((corner.x - prev.x) / before) * r;
      const fromY = corner.y - ((corner.y - prev.y) / before) * r;
      const toX = corner.x + ((next.x - corner.x) / after) * r;
      const toY = corner.y + ((next.y - corner.y) / after) * r;
      d += ` L${fromX},${fromY} Q${corner.x},${corner.y} ${toX},${toY}`;
    }
    const last = points.at(-1);
    return d + ` L${last.x},${last.y}`;
  }

  anchorPoint(anchorEl, direction) {
    const rect = anchorEl.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    let x = direction === "out" ? rect.right + 6 : rect.left - 6;
    const y = rect.top + rect.height / 2;
    let scrolledOut = false;
    if (this.contains(anchorEl)) {
      // On the panel's edge, so the dots peek out.
      const clip = this.getBoundingClientRect();
      x = direction === "out" ? clip.right : clip.left;
      // Not clamped: wires scroll away with their ports.
      scrolledOut = y < clip.top || y > clip.bottom;
    }
    return { x, y, scrolledOut };
  }

  // A dot for every port, wired or not.
  drawPorts() {
    for (const [lineEl, { direction, dot }] of this._portDots) {
      const point = lineEl.isConnected && this.anchorPoint(lineEl, direction);
      if (!point || point.scrolledOut) {
        dot.style.display = "none";
        continue;
      }
      dot.style.display = "";
      if (
        dot.getAttribute("cy") != point.y ||
        dot.getAttribute("cx") != point.x
      ) {
        dot.setAttribute("cx", point.x);
        dot.setAttribute("cy", point.y);
      }
    }
  }

  addPortDot(lineEl, direction) {
    const dot = document.createElementNS(SVG, "circle");
    dot.setAttribute("class", "mm-debug--port mm-debug--port-" + direction);
    dot.setAttribute("r", "4");
    dot.setAttribute("color", "darkgray");
    dot.setAttribute("stroke", "currentColor");
    dot.setAttribute("stroke-width", "2");
    dot.setAttribute("fill", direction === "out" ? "white" : "currentColor");
    // Under the wires.
    this._wiresEl.prepend(dot);
    this._portDots.set(lineEl, { direction, dot });
  }

  drawWires() {
    this.drawPorts();
    const wires = new Set(
      this._targetEl ? this._targetEl.querySelectorAll("mm-wire") : []
    );
    for (const [wire, group] of this._wirePaths) {
      if (!wires.has(wire)) {
        group.remove();
        this._wirePaths.delete(wire);
      }
    }
    let lanes = 0;
    const sourceLanes = new Map();
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

      // Draw the runtime's resolved endpoints, not a second guessed connection.
      const source = wire.source;
      const target = wire.target;
      const a =
        source && this.portAnchor(source, "out", wire.getAttribute("out"));
      const b =
        target && this.portAnchor(target, "in", wire.getAttribute("in"));
      if (!a || !b) {
        group.style.display = "none";
        continue;
      }
      group.style.display = "";

      const known = wire.status === "connected";
      group.setAttribute(
        "class",
        "mm-debug--wire mm-debug--wire-" + wire.status +
          (known ? "" : " mm-debug--wire-unknown")
      );
      group.setAttribute("stroke-dasharray", known ? "none" : "2 6");

      // Out to the right, back under the source element, then along the
      // left side to the in-port. Each wire gets its own lane.
      const lane = lanes++;
      const sourceLane = sourceLanes.get(source) || 0;
      sourceLanes.set(source, sourceLane + 1);
      const right = a.x + 14 + sourceLane * 8;
      const left = b.x - 14 - lane * 8;
      const under = a.under + sourceLane * 8;
      const d = this.roundedPath([
        { x: a.x, y: a.y },
        { x: right, y: a.y },
        { x: right, y: under },
        { x: left, y: under },
        { x: left, y: b.y },
        { x: b.x, y: b.y },
      ]);
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

    // Built-in elements only list their events.
    const builtIn = manifest && manifest === htmlElements[mmChild.localName];
    const { members: allMembers = [], events = [] } = manifest || {};
    const members = builtIn ? [] : allMembers;
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
      this.addPortDot(lineEl, "in");
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
        this.addPortDot(lineEl, "in");
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
          const failed = (error) => {
            buttonEl.title = String(error);
            buttonEl.classList.add("mm-debug--error");
          };
          buttonEl.title = "";
          buttonEl.classList.remove("mm-debug--error");
          try {
            Promise.resolve(mmChild[name]()).then(refresh, failed);
            refresh();
          } catch (error) {
            failed(error);
          }
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
      lineEl.style.textAlign = "right";
      // An event with a method of the same name (click) gets a trigger.
      const trigger = allMembers.some(
        (member) =>
          member.kind === "method" &&
          member.name === event.name &&
          !(member.parameters || []).length
      );
      if (trigger) {
        const buttonEl = document.createElement("button");
        buttonEl.className = "mm-debug--button";
        buttonEl.textContent = "@" + event.name;
        buttonEl.addEventListener("click", () => mmChild[event.name]());
        lineEl.append(buttonEl, " ", countEl);
      } else {
        lineEl.append("@" + event.name + " ", countEl);
      }
      ports.out.set(event.name, lineEl);
      this.addPortDot(lineEl, "out");
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
    if (!mmChild.children.length && text.length <= 40) endEl.append(text);
    if (!isParent) endEl.append(close);

    refresh();
  }
}

customElements.define("mm-debug", MmDebug);
