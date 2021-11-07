const template = document.createElement("template");
template.innerHTML = `
  <div class="mm-debug-child"></div>
  <div class="mm-debug-child-inspect"></div>
`;

class MmDebug extends HTMLElement {
  constructor() {
    super();
  }

  static get observedAttributes() {
    return ["hidden"];
  }

  set hidden(val) {
    this.__hidden = val;
    this.querySelectorAll(".mm-debug-child-inspect").forEach((el) => {
      el.style.display = val ? "none" : "block";
    });
  }
  get hidden() {
    return this.__hidden;
  }

  mmManifest() {
    return {
      name: "MmDebug",
      tag: "mm-debug",
      members: [{ kind: "field", name: "hidden", type: "boolean" }],
    };
  }

  connectedCallback() {
    // Wait for child custom elements load
    const undefinedElements = this.querySelectorAll(":not(:defined)");
    const definedPromises = [...undefinedElements].map((el) =>
      customElements.whenDefined(el.localName)
    );
    const mmChildren = [];

    // Find the children with mmManifest
    Promise.all(definedPromises).then((defs) => {
      for (let child of this.children) {
        if (child.mmManifest) {
          mmChildren.push(child);
        }
      }
      for (let mmChild of mmChildren) {
        const fragment = template.content.cloneNode(true);

        const el = document.createElement("div");
        el.className = "mm-debug";
        this.appendChild(el);
        el.appendChild(fragment);

        const childEl = el.querySelector(".mm-debug-child");
        childEl.appendChild(mmChild);

        const inspectEl = el.querySelector(".mm-debug-child-inspect");
        this.mountInspector(mmChild, inspectEl);

        mmChild.addEventListener("mm-manifest-changed", () => {
          this.mountInspector(mmChild, inspectEl);
        });
      }
    });

    // Hide inspectors if hidden
    // TODO: correct way to to this?
    if (this.hasAttribute("hidden")) {
      this.hidden = true;
    }
  }
  mountInspector(mmChild, inspectEl) {
    inspectEl.innerHTML = "";

    const { name, tag, members } = mmChild.mmManifest();
    const h2 = document.createElement("h2");
    h2.textContent = tag;
    inspectEl.appendChild(h2);

    for (let member of members) {
      const { kind, name, type, options } = member;
      if (kind === "method") {
        const buttonEl = document.createElement("button");
        buttonEl.className = "mm-debug-button";
        buttonEl.innerText = name;
        buttonEl.addEventListener("click", () => {
          mmChild[name]();
        });
        inspectEl.appendChild(buttonEl);
      }
      if (kind === "field") {
        if (type === "boolean") {
          const labelEl = document.createElement("label");
          labelEl.textContent = name;
          const inputEl = document.createElement("input");
          inputEl.type = "checkbox";
          inputEl.checked = mmChild[name];
          inputEl.addEventListener("change", () => {
            mmChild[name] = inputEl.checked;
          });
          labelEl.appendChild(inputEl);
          inspectEl.appendChild(labelEl);
        }
        if (options) {
          const select = document.createElement("select");
          select.addEventListener("change", () => {
            mmChild[name] = select.value;
          });
          for (let { label, value } of options) {
            const optionEl = document.createElement("option");
            optionEl.className = "mm-debug-select";
            optionEl.value = value;
            optionEl.textContent = label;
            select.appendChild(optionEl);
          }
          inspectEl.appendChild(select);
        }
      }
    }
  }
}

customElements.define("mm-debug", MmDebug);
