// Ports of built-in elements, in custom elements manifest shape.
const field = (name, type = "string") => ({
  kind: "field", name, type: { text: type },
});
const valueEvents = ["input", "change"].map((name) => ({
  name,
  type: { text: "Event" },
  mm: { kind: "message", adapter: "value" },
}));

export default {
  button: {
    tagName: "button",
    members: [
      { kind: "method", name: "click" },
      { kind: "field", name: "disabled", type: { text: "boolean" } },
    ],
    events: [
      { name: "click", type: { text: "MouseEvent" }, mm: { kind: "signal" } },
    ],
  },
  input: {
    tagName: "input",
    members: [field("value"), field("checked", "boolean"), field("disabled", "boolean")],
    events: valueEvents,
  },
  select: {
    tagName: "select",
    members: [field("value"), field("disabled", "boolean")],
    events: valueEvents,
  },
  textarea: {
    tagName: "textarea",
    members: [field("value"), field("disabled", "boolean")],
    events: valueEvents,
  },
};
