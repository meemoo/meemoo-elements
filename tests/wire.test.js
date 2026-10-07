import test from "node:test";
import assert from "node:assert/strict";
import { installDOM } from "./dom.js";

const { element } = installDOM();
const { MmWire } = await import("../src/mm-graph.js");

class Source extends HTMLElement {
  static mmManifest = async () => ({
    members: [{ kind: "field", name: "value", readonly: true }],
    events: [
      { name: "message" },
      { name: "signal", mm: { kind: "signal" } },
      { name: "state", mm: { kind: "state", property: "value" } },
      { name: "bad-state", mm: { kind: "state" } },
    ],
  });
  value = null;
}
class Target extends HTMLElement {
  static mmManifest = async () => ({
    members: [
      { kind: "field", name: "value" },
      { kind: "field", name: "readonly", readonly: true },
      { kind: "method", name: "trigger" },
      { kind: "method", name: "receive", parameters: [{ name: "value" }] },
      { kind: "method", name: "multiple", parameters: [{ name: "a" }, { name: "b" }] },
    ],
  });
  value = "initial";
  calls = [];
  trigger(...args) { this.calls.push(args); }
  receive(...args) { this.calls.push(args); }
}
customElements.define("test-source", Source);
customElements.define("test-target", Target);

function setup(out = "message", input = "value") {
  const graph = element("mm-graph");
  const source = new Source();
  source.localName = "test-source";
  source.id = "source";
  const target = new Target();
  target.localName = "test-target";
  target.id = "target";
  const wire = new MmWire();
  wire.localName = "mm-wire";
  for (const [name, value] of Object.entries({
    from: "source", out, to: "target", in: input,
  })) wire.setAttribute(name, value);
  graph.appendChild(source);
  graph.appendChild(target);
  graph.appendChild(wire);
  source.isConnected = target.isConnected = wire.isConnected = true;
  return { graph, source, target, wire };
}

test("signals invoke commands with no argument and never replay", async () => {
  const { source, target, wire } = setup("signal", "trigger");
  source.signal = "not retained state";
  await wire.connect();
  assert.equal(wire.status, "connected");
  assert.deepEqual(target.calls, []);
  source.dispatchEvent(new Event("signal"));
  assert.deepEqual(target.calls, [[]]);
  await wire.connect();
  assert.deepEqual(target.calls, [[]]);
});

test("messages preserve null and undefined and never replay", async () => {
  const { source, target, wire } = setup();
  source.message = "not retained state";
  await wire.connect();
  assert.equal(target.value, "initial");
  source.dispatchEvent(new CustomEvent("message", { detail: null }));
  assert.equal(target.value, null);
  source.dispatchEvent(new CustomEvent("message", { detail: undefined }));
  // The browser's CustomEvent constructor defaults undefined detail to null.
  assert.equal(target.value, null);
  await wire.connect();
  assert.equal(target.value, null);
});

test("state reads only its declared property, including on connection", async () => {
  const { source, target, wire } = setup("state");
  await wire.connect();
  assert.equal(target.value, null);
  source.value = 42;
  source.dispatchEvent(new CustomEvent("state", { detail: "ignored" }));
  assert.equal(target.value, 42);
  source.value = undefined;
  await wire.connect();
  assert.equal(target.value, undefined);
});

test("value methods receive one borrowed reference", async () => {
  const { source, target, wire } = setup("message", "receive");
  await wire.connect();
  const value = { frames: [] };
  source.dispatchEvent(new CustomEvent("message", { detail: value }));
  assert.equal(target.calls[0].length, 1);
  assert.equal(target.calls[0][0], value);
});

test("initial state reads use the same delivery error policy as events", async () => {
  const { source, target, wire } = setup("state");
  const error = new Error("state unavailable");
  Object.defineProperty(source, "value", { get() { throw error; } });
  await wire.connect();
  assert.equal(wire.reason, "delivery-failed");
  assert.equal(wire.error, error);
  assert.equal(target.value, "initial");
});

test("incomplete and missing endpoint wires are pending, not errors", async () => {
  const { wire } = setup();
  wire.isConnected = false;
  wire.to = null;
  wire.isConnected = true;
  await wire.connect();
  assert.equal(wire.status, "pending");
  assert.equal(wire.reason, "incomplete");
  assert.equal(wire.error, null);
  wire.isConnected = false;
  wire.to = "not-here";
  wire.isConnected = true;
  await wire.connect();
  assert.equal(wire.reason, "awaiting-endpoint");
});

test("disabled and detached wires do not deliver", async () => {
  const { source, target, wire } = setup();
  wire.setAttribute("disabled", "");
  await wire.connect();
  assert.equal(wire.status, "disconnected");
  assert.equal(wire.reason, "disabled");
  source.dispatchEvent(new CustomEvent("message", { detail: 1 }));
  assert.equal(target.value, "initial");
  wire.isConnected = false;
  wire.removeAttribute("disabled");
  wire.isConnected = true;
  await wire.connect();
  wire.isConnected = false;
  wire.disconnectedCallback();
  assert.equal(wire.reason, "detached");
  source.dispatchEvent(new CustomEvent("message", { detail: 2 }));
  assert.equal(target.value, "initial");
});

test("invalid ports and unsupported signatures have diagnostics, not expandos", async () => {
  for (const [out, input] of [
    ["message", "typo"], ["typo", "value"], ["message", "readonly"],
    ["signal", "value"], ["signal", "receive"], ["message", "trigger"],
    ["message", "multiple"], ["bad-state", "value"],
  ]) {
    const { source, target, wire } = setup(out, input);
    await wire.connect();
    assert.equal(wire.status, "error", `${out} → ${input}`);
    assert.equal(wire.reason, "invalid-connection");
    assert.ok(wire.error instanceof Error);
    source.dispatchEvent(new CustomEvent(out, { detail: 123 }));
    assert.equal(target.value, "initial");
    assert.equal(Object.hasOwn(target, "typo"), false);
  }
});

test("delivery failures stop delivery and expose sync and async errors", async () => {
  for (const asynchronous of [false, true]) {
    const { source, target, wire } = setup("message", "receive");
    const error = new Error("consumer failed");
    target.receive = () => {
      if (asynchronous) return Promise.reject(error);
      throw error;
    };
    await wire.connect();
    source.dispatchEvent(new CustomEvent("message", { detail: 1 }));
    await Promise.resolve();
    assert.equal(wire.status, "error");
    assert.equal(wire.reason, "delivery-failed");
    assert.equal(wire.error, error);
    target.receive = () => assert.fail("failed wire must stop delivering");
    source.dispatchEvent(new CustomEvent("message", { detail: 2 }));
  }
});

test("cancelled asynchronous failures cannot overwrite a newer connection", async () => {
  const { source, target, wire } = setup("message", "receive");
  let reject;
  target.receive = () => new Promise((_, fail) => { reject = fail; });
  await wire.connect();
  source.dispatchEvent(new CustomEvent("message", { detail: 1 }));
  await wire.connect();
  reject(new Error("old delivery failed"));
  await Promise.resolve();
  assert.equal(wire.status, "connected");
});

test("graph resolution excludes other and nested graphs", async () => {
  const { graph, wire } = setup();
  const nested = element("mm-graph");
  const target = new Target();
  target.localName = "test-target";
  target.id = "nested-target";
  nested.appendChild(target);
  graph.appendChild(nested);
  wire.isConnected = false;
  wire.to = "nested-target";
  wire.isConnected = true;
  await wire.connect();
  assert.equal(wire.reason, "awaiting-endpoint");
});

test("standalone wires use their document or shadow root", async () => {
  const { graph, source, target, wire } = setup();
  graph.localName = "div";
  await wire.connect();
  assert.equal(wire.status, "connected");
  assert.equal(wire.source, source);
  assert.equal(wire.target, target);
});

test("explicit retry rebinds replaced endpoints without duplicate listeners", async () => {
  const { graph, source, target, wire } = setup();
  await wire.connect();
  const replacement = new Target();
  replacement.localName = "test-target";
  replacement.id = "target";
  graph.children = graph.children.filter((child) => child !== target);
  graph.appendChild(replacement);
  await wire.connect();
  await wire.connect();
  source.dispatchEvent(new CustomEvent("message", { detail: 42 }));
  assert.equal(target.value, "initial");
  assert.equal(replacement.value, 42);
});

test("native click is a signal and native controls adapt values", async () => {
  const { graph, source, target, wire } = setup("click", "trigger");
  graph.children = graph.children.filter((child) => child !== source);
  const button = element("button");
  button.id = "source";
  graph.appendChild(button);
  await wire.connect();
  button.dispatchEvent(new Event("click"));
  assert.deepEqual(target.calls, [[]]);
  graph.children = graph.children.filter((child) => child !== button);
  const control = element("input");
  control.id = "source";
  control.type = "number";
  control.valueAsNumber = 12;
  graph.appendChild(control);
  wire.isConnected = false;
  wire.out = "input";
  wire.in = "value";
  wire.isConnected = true;
  await wire.connect();
  control.dispatchEvent(new Event("input"));
  assert.equal(target.value, 12);
  control.type = "checkbox";
  control.checked = false;
  control.dispatchEvent(new Event("input"));
  assert.equal(target.value, false);
});

test("late definitions stay pending and stale connections cannot attach", async () => {
  const { source, target, wire } = setup();
  source.localName = "late-source";
  const old = wire.connect();
  assert.equal(wire.reason, "awaiting-definition");
  source.localName = "test-source";
  await wire.connect();
  customElements.define("late-source", Source);
  await old;
  source.dispatchEvent(new CustomEvent("message", { detail: 10 }));
  assert.equal(target.value, 10);
  assert.equal(wire.status, "connected");
});

test("status changes expose reason and error without changing authored HTML", async () => {
  const { wire } = setup();
  const events = [];
  wire.addEventListener("wire-status", (event) => events.push(event.detail));
  await wire.connect();
  assert.equal(events.at(-1).status, "connected");
  assert.equal(events.at(-1).error, null);
  assert.equal(wire.hasAttribute("status"), false);
});
