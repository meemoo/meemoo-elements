# meemoo-elements

WIP experiment to do some meemoo.org things with modern vanilla web components.

Thanks [@WestbrookJ for the hints](https://twitter.com/WestbrookJ/status/1456958739538448389) on [Custom Elements Manifest](https://dev.to/open-wc/introducing-custom-elements-manifest-gkk). I'm not using it exactly, but I'm borrowing some of the ideas.

## Concept

- No build
- No dependencies
- Pull in each element with one script tag
- `<mm-*>` elements have `mmManifest` to call, which will return some info about what you can call or set on it
- `<mm-debug>` will make some UI for setting attributes and calling methods on its child `<mm-*>` elements

```html
<mm-debug>
  <mm-webcam></mm-webcam>
</mm-debug>

<!-- Only need the tags for the elements that you use, once, at end of body. -->
<script
  type="module"
  src="https://cdn.jsdelivr.net/gh/meemoo/meemoo-elements@main/src/mm-debug.js"
></script>
<script
  type="module"
  src="https://cdn.jsdelivr.net/gh/meemoo/meemoo-elements@main/src/mm-webcam.js"
></script>
```

### TBD

- [ ] Better practices for basic custom element mounting and updating stuff 😅
- [ ] Enumerate events, like out-ports in meemoo.org
- [ ] "Wiring" listeners?

## Non asked questions

### Why no shadow DOM?

I don't want to encapsulate DOM or styles with these, to make it easier to style them from the outside. This should make it possible to use and style these with Webflow, by making styles for `.mm-debug--button`, `.mm-debug--select` etc.

### Can I use and style these in Webflow?

Yes. Example here: https://meemoo-elements.webflow.io

### Can I use these in ObservableHQ?

Yes. https://observablehq.com/@forresto/mm-webcam

### Can I use these in Natto.dev?

Yes. https://natto.dev/@forresto/12caeded111241c1a775ed82180a6ca8
