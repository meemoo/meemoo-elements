const image = { text: "CustomEvent<CanvasImageSource>" };

export default {
  kind: "class",
  customElement: true,
  name: "MmWebcam",
  tagName: "mm-webcam",
  superclass: { name: "HTMLElement" },
  attributes: [
    { name: "cam-id", fieldName: "camId", type: { text: "string" } },
    { name: "fps", fieldName: "fps", type: { text: "number" }, default: "30" },
  ],
  members: [
    { kind: "method", name: "start" },
    { kind: "method", name: "stop" },
    { kind: "method", name: "send" },
    {
      kind: "field",
      name: "camId",
      type: { text: "string" },
      mm: { optionsFrom: "cameras" },
    },
    {
      kind: "field",
      name: "fps",
      type: { text: "number" },
      default: "30",
      mm: { min: 0, max: 60 },
    },
    {
      kind: "field",
      name: "cameras",
      readonly: true,
      type: { text: "Array<{label: string, value: string}>" },
    },
  ],
  events: [
    { name: "stream", type: image, mm: { type: "image" } },
    { name: "image", type: image, mm: { type: "image" } },
    {
      name: "cameras",
      type: { text: "CustomEvent<Array<{label: string, value: string}>>" },
    },
    { name: "mm-webcam-start", type: { text: "Event" } },
  ],
};
