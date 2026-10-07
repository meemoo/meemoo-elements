const string = { text: "string" };

const graph = {
  kind: "class",
  customElement: true,
  name: "MmGraph",
  tagName: "mm-graph",
  superclass: { name: "HTMLElement" },
  attributes: [
    { name: "src", type: string },
    { name: "modules", type: string },
  ],
};

const wireAttributes = ["from", "out", "to", "in"];

const wire = {
  kind: "class",
  customElement: true,
  name: "MmWire",
  tagName: "mm-wire",
  superclass: { name: "HTMLElement" },
  attributes: [
    ...wireAttributes.map((name) => ({ name, fieldName: name, type: string })),
    { name: "disabled", type: { text: "boolean" } },
  ],
  members: [
    ...wireAttributes.map((name) => ({ kind: "field", name, type: string })),
    { kind: "method", name: "connect" },
    ...["status", "reason"].map((name) => ({
      kind: "field", name, readonly: true, type: string,
    })),
    { kind: "field", name: "error", readonly: true, type: { text: "Error | null" } },
    ...["source", "target"].map((name) => ({
      kind: "field", name, readonly: true, type: { text: "Element | null" },
    })),
  ],
  events: [
    {
      name: "wire-status",
      type: { text: "CustomEvent<{status: string, reason: string, error: Error | null}>" },
    },
  ],
};

export default [graph, wire];
