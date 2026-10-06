const corners = ["xtl", "ytl", "xtr", "ytr", "xbr", "ybr", "xbl", "ybl"];

export default {
  kind: "class",
  customElement: true,
  name: "MmQuadwarp",
  tagName: "mm-quadwarp",
  superclass: { name: "HTMLElement" },
  attributes: corners.map((name) => ({
    name,
    fieldName: name,
    type: { text: "number" },
  })),
  members: corners.map((name) => ({
    kind: "field",
    name,
    type: { text: "number" },
  })),
};
