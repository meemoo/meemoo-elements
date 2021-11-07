# meemoo-elements

WIP experiment to do some meemoo.org things with modern vanilla web components.

Thanks [@WestbrookJ for the hints](https://twitter.com/WestbrookJ/status/1456958739538448389) on [Custom Elements Manifest](https://dev.to/open-wc/introducing-custom-elements-manifest-gkk). I'm not using it exactly, but I'm borrowing some of the concepts.

## Concept

- No build
- No dependencies
- Pull in each element with one script tag
- `<mm-*>` elements have `mmManifest` to call, which will return some info about what you can call or set on it
- `<mm-debug>` will make some UI for setting attributes and calling methods on it's child `<mm-*>` elements

```html
<mm-debug>
  <mm-webcam></mm-webcam>
</mm-debug>

<script type="module" src="./src/mm-debug.js"></script>
<script type="module" src="./src/mm-webcam.js"></script>
```

### TBD

- [ ] Enumerate events, like out-ports in meemoo.org
- [ ] "Wiring" listeners?

## Non asked questions

### Why no shadow DOM?

I don't want to encapsulate DOM or styles with these, to make it easier to style them from the outside. This should make it possible to use and style these with Webflow, by making styles for eg `.mm-debug-button` and `.mm-debug-select` etc.
