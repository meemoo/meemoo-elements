const animation =
  "{width: number, height: number, fps: number, frames: HTMLCanvasElement[]}";

export default {
  kind: "class",
  customElement: true,
  name: "MmAnimation",
  tagName: "mm-animation",
  superclass: { name: "HTMLElement" },
  attributes: [
    { name: "fps", fieldName: "fps", type: { text: "number" }, default: "12" },
    {
      name: "max-length",
      fieldName: "maxLength",
      type: { text: "number" },
      default: "0",
    },
  ],
  members: [
    {
      kind: "method",
      name: "push",
      parameters: [
        {
          name: "image",
          type: { text: "CanvasImageSource" },
          mm: { type: "image" },
        },
      ],
    },
    { kind: "method", name: "clear" },
    { kind: "method", name: "send" },
    {
      kind: "field",
      name: "fps",
      type: { text: "number" },
      default: "12",
      mm: { min: 0 },
    },
    {
      kind: "field",
      name: "maxLength",
      type: { text: "number" },
      default: "0",
      mm: { min: 0, step: 1 },
    },
    {
      kind: "field",
      name: "animation",
      readonly: true,
      type: { text: animation },
      mm: { type: "animation" },
    },
  ],
  events: [
    {
      name: "animation",
      type: { text: `CustomEvent<${animation}>` },
      mm: { type: "animation" },
    },
  ],
};
