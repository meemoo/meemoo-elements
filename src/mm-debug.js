const childTemplate = document.createElement("template");
childTemplate.innerHTML = `
  <div class="mm-debug--inspect"></div>
`;

class MmDebug extends HTMLElement {
  constructor() {
    super();
  }

  static get observedAttributes() {
    return ["hidden"];
  }

  set hidden(val) {
    this._hidden = val;
    this.querySelectorAll(".mm-debug").forEach((el) => {
      el.style.display = val ? "none" : "block";
    });
  }
  get hidden() {
    return this._hidden;
  }

  mmManifest() {
    return {
      name: "MmDebug",
      tagName: "mm-debug",
      members: [{ kind: "field", name: "hidden", type: "boolean" }],
    };
  }

  connectedCallback() {
    // Wait for child custom elements load
    const undefinedElements = this.querySelectorAll(":not(:defined)");
    const definedPromises = [...undefinedElements].map((el) =>
      customElements.whenDefined(el.localName)
    );
    const allElements = this.querySelectorAll("*");
    const mmChildren = [];

    // Find the children with mmManifest
    Promise.all(definedPromises).then((defs) => {
      for (let child of allElements) {
        if (child.mmManifest) {
          mmChildren.push(child);
        }
      }
      for (let mmChild of mmChildren) {
        const fragment = childTemplate.content.cloneNode(true);

        const el = document.createElement("div");
        el.className = "mm-debug";
        el.appendChild(fragment);

        mmChild.after(el);

        const inspectEl = el.querySelector(".mm-debug--inspect");
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

  disconnectedCallback() {
    // TODO: removeEventListener?
  }

  mountInspector(mmChild, inspectEl) {
    inspectEl.innerHTML = "";

    const { name, tagName, members, events } = mmChild.mmManifest();
    const tagEl = document.createElement("div");
    tagEl.className = "mm-debug--tag";
    tagEl.textContent = tagName + ":";
    inspectEl.appendChild(tagEl);

    for (let member of members) {
      const { kind, name, type, options } = member;
      if (kind === "method") {
        const buttonEl = document.createElement("button");
        buttonEl.className = "mm-debug--button";
        buttonEl.innerText = name;
        buttonEl.addEventListener("click", () => {
          mmChild[name]();
        });
        inspectEl.appendChild(buttonEl);
      }
      if (kind === "field") {
        if (type === "boolean") {
          const labelEl = document.createElement("label");
          labelEl.className = "mm-debug--label";
          labelEl.textContent = name;
          const inputEl = document.createElement("input");
          inputEl.className = "mm-debug--checkbox";
          inputEl.type = "checkbox";
          inputEl.checked = mmChild[name];
          inputEl.addEventListener("change", () => {
            mmChild[name] = inputEl.checked;
          });
          labelEl.appendChild(inputEl);
          inspectEl.appendChild(labelEl);
        }
        if (type === "number") {
          const labelEl = document.createElement("label");
          labelEl.className = "mm-debug--label";
          labelEl.textContent = name;
          const inputEl = document.createElement("input");
          inputEl.className = "mm-debug--checkbox";
          inputEl.type = "number";
          inputEl.value = mmChild[name];
          inputEl.addEventListener("change", () => {
            // To decide: directly set member or attribute? Element needs to
            // react to changes. This says both:
            // https://developers.google.com/web/fundamentals/web-components/best-practices#aim-to-keep-primitive-data-attributes-and-properties-in-sync,-reflecting-from-property-to-attribute,-and-vice-versa.
            mmChild.setAttribute(name, inputEl.valueAsNumber);
          });
          labelEl.appendChild(inputEl);
          inspectEl.appendChild(labelEl);
        }
        if (options) {
          const selectEl = document.createElement("select");
          selectEl.className = "mm-debug--select";
          selectEl.addEventListener("change", () => {
            mmChild[name] = selectEl.value;
          });
          for (let { label, value } of options) {
            const optionEl = document.createElement("option");
            optionEl.value = value;
            optionEl.textContent = label;
            optionEl.selected = mmChild[name] === value;
            selectEl.appendChild(optionEl);
          }
          inspectEl.appendChild(selectEl);
        }
      }
    }
    /** TODO: we lose all of this DOM state when mountInspector wipes stuff
     * out... think about if/how to expose/inspect events */
    if (events) {
      for (let event of events) {
        const labelEl = document.createElement("label");
        labelEl.className = "mm-debug--label";
        labelEl.textContent = event.name;
        const inputEl = document.createElement("input");
        inputEl.className = "mm-debug--checkbox";
        inputEl.type = "checkbox";
        labelEl.appendChild(inputEl);
        inspectEl.appendChild(labelEl);

        // const eventDebugEl = document.createElement("span");
        // inspectEl.appendChild(eventDebugEl);

        // const updateDebug = (e) => {
        //   // TODO: ???
        //   if (event.property) {
        //     eventDebugEl.textContent = "🛎";
        //   }
        // };

        // inputEl.addEventListener("change", (e) => {
        //   if (e.target.checked) {
        //     mmChild.addEventListener(event.name, updateDebug);
        //   } else {
        //     mmChild.removeEventListener(event.name, updateDebug);
        //   }
        // });
      }
    }
  }
}

customElements.define("mm-debug", MmDebug);

// class MmDebugChild extends HTMLElement {
//   constructor() {
//     super();
//   }
//   connectedCallback() {}
// }
