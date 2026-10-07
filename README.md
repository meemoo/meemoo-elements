# meemoo-elements

WIP experiment to do some meemoo.org things with modern vanilla web components.

Thanks [@WestbrookJ for the hints](https://twitter.com/WestbrookJ/status/1456958739538448389) on [Custom Elements Manifest](https://dev.to/open-wc/introducing-custom-elements-manifest-gkk). I'm not using it exactly, but I'm borrowing some of the ideas.

## Concept

- No build
- No dependencies
- Pull in each element with one script tag
- `<mm-*>` constructors have an async `mmManifest()` describing their properties, methods, and events
- `<mm-debug for="id">` will make some UI for setting attributes and calling methods on the `<mm-*>` elements inside the element with that id

```html
<mm-graph id="app">
  <button id="start">start camera</button>
  <mm-webcam id="cam"></mm-webcam>
  <mm-wire from="start" out="click" to="cam" in="start"></mm-wire>
</mm-graph>

<mm-debug for="app"></mm-debug>

<!-- Only need the tags for the elements that you use, once, at end of body. -->
<script
  type="module"
  src="https://cdn.jsdelivr.net/gh/meemoo/meemoo-elements@main/src/mm-webcam.js"
></script>
<script
  type="module"
  src="https://cdn.jsdelivr.net/gh/meemoo/meemoo-elements@main/src/mm-debug.js"
></script>
<!-- mm-graph.js also defines mm-wire. -->
<script
  type="module"
  src="https://cdn.jsdelivr.net/gh/meemoo/meemoo-elements@main/src/mm-graph.js"
></script>
```

## Wiring contract

`from` and `to` name element IDs; `out` names a declared event and `in` names a
declared writable JavaScript property or method. Attributes use kebab-case;
property endpoints use camelCase. A wire resolves inside its nearest `mm-graph`,
excluding nested graphs. Standalone wires resolve in their document or shadow root.

Output semantics live in the event manifest's `mm` metadata:

| `mm.kind`           | Delivery                                              | Initial/reconnect delivery      |
| ------------------- | ----------------------------------------------------- | ------------------------------- |
| `signal`            | Invoke a method with zero arguments                   | Never                           |
| `message` (default) | Pass `CustomEvent.detail` unchanged, including `null` | Never                           |
| `state`             | Read the declared `mm.property` on each event         | Send the current property value |

State properties must be declared fields. There is no implicit replay based on
matching event/property names, and no implicit `*-changed` conversion. Methods
accept at most one parameter: signals require no required parameter; value
outputs require one declared parameter. Readonly, unknown, and unsupported inputs
are errors rather than arbitrary property assignments.

Native adapters cover `button`, `input`, `select`, and `textarea`. Button `click`
is a signal. Control `input`/`change` events read `checked` for checkbox/radio,
`valueAsNumber` for number/range, and `value` otherwise. There are no transforms,
queues, or implicit copies; ordinary JS remains the escape hatch.

### Connection lifecycle

Each wire exposes readonly `status`, `reason`, `error`, `source`, and `target`.
`wire-status` carries `{status, reason, error}` whenever status changes.

| Status         | Meaning                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| `pending`      | `resolving`, `incomplete`, `awaiting-document`, `awaiting-endpoint`, or `awaiting-definition` |
| `connected`    | Ports validated and delivery active                                                           |
| `disconnected` | `disabled` attribute present, or wire detached                                                |
| `error`        | `invalid-connection` or `delivery-failed`, with an `Error` diagnostic                         |

A dangling `<mm-wire from="cam" out="image">` is valid HTML and remains pending.
Synchronous throws and rejected method promises stop delivery and become wire
errors. Attribute edits reconnect automatically. After inserting/replacing an
endpoint, or to retry an error, call `await wire.connect()`; topology is not yet
automatically observed. Definition waits resume when the element is registered.
The inspector reads the runtime's resolved endpoints and diagnostic state.

Loose-end coordinates are future editor metadata, not runtime connection
semantics. Drag-to-connect and drawing loose ends are not implemented yet.

### Element authoring and ownership

- Keep domain behavior usable without wires or the inspector.
- Describe public APIs in `constructor.mmManifest()`; keep dynamic choices in
  instance properties (`mm.optionsFrom` references one). Run `npm run manifest`
  after changing manifests to regenerate `custom-elements.json`.
- Attributes provide declarative configuration; properties are the operational
  API. Reflection is explicit per property. Reflected settings should normalize
  through one path, guard equal values, and emit declared state-change events.
- Borrowed DOM/media/object values must not be mutated by receivers. Clone or
  capture before modifying. Borrowed values can remain live: asynchronous
  consumers needing the value at delivery time must capture it then.
- Async resource commands should return promises, invalidate stale requests,
  release stale resources, and clean up on disconnect. `mm-webcam.start()`
  resolves when the stream is attached (not the first playable frame), resolves
  `undefined` if cancelled, and rejects acquisition/setup failures. Internal
  camera-switch and enumeration failures emit `error` with an `Error` detail.

Camera `image` and `stream`, and animation `animation`, are messages, not retained
state. Camera `cameras` is retained state with `mm.property: "cameras"`.
Animation values remain shared/live; frames are captured when `push()` runs.

Future "copy HTML" should reproduce current configuration, user-authored content,
module references, and complete/dangling wires with editor metadata. It must
exclude component-owned rendering and inspector nodes. Saved frames require an
asset/embedding format; active streams and permissions are not serializable.
Live reflection alone is not a complete export implementation.

`mm-graph`'s `src` HTML and `modules` are trusted application code, not a sandbox.
Explicit module URLs are supported; first-party `mm-*` tags also autoload from
the graph module's directory. Fetched content's relative URLs currently resolve
against the containing document.

## Development checks

Run `npm test` for protocol and camera cancellation tests (Node 22+; no packages).
Serve the repository and open `tests/browser.html` for real DOM/inspector smoke
tests. These do not request camera permission or exercise real hardware.

### Next steps

- [ ] Automatic topology reconciliation and non-blocking inspector discovery
- [ ] Reflected draggable quadwarp coordinates and batched layout updates
- [ ] Graph-fetch cancellation and load diagnostics
- [ ] Editor metadata, loose-end rendering, and deliberate HTML export

## Non asked questions

### Why no shadow DOM?

I don't want to encapsulate DOM or styles with these, to make it easier to style them from the outside. This should make it possible to use and style these with Webflow, by making styles for `.mm-debug--button`, `.mm-debug--select` etc.

### Can I use and style these in Webflow?

Yes. Example here: https://meemoo-elements.webflow.io

### Can I use these in ObservableHQ?

Yes. https://observablehq.com/@forresto/mm-webcam

### Can I use these in Natto.dev?

Yes. https://natto.dev/@forresto/12caeded111241c1a775ed82180a6ca8
