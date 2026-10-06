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
  attributes: wireAttributes.map((name) => ({
    name,
    fieldName: name,
    type: string,
  })),
  members: wireAttributes.map((name) => ({
    kind: "field",
    name,
    type: string,
  })),
};

export default [graph, wire];
