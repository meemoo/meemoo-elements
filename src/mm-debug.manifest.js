export default {
  kind: "class",
  customElement: true,
  name: "MmDebug",
  tagName: "mm-debug",
  superclass: { name: "HTMLElement" },
  attributes: [
    { name: "hidden", fieldName: "hidden", type: { text: "boolean" } },
    { name: "shallow", type: { text: "boolean" } },
    { name: "mount", type: { text: "string" } },
  ],
  members: [{ kind: "field", name: "hidden", type: { text: "boolean" } }],
};
