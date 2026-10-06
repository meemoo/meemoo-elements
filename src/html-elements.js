// Ports of built-in elements, in custom elements manifest shape.
export default {
  button: {
    tagName: "button",
    members: [
      { kind: "method", name: "click" },
      { kind: "field", name: "disabled", type: { text: "boolean" } },
    ],
    events: [{ name: "click", type: { text: "MouseEvent" } }],
  },
};
