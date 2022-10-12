// Returns style object with matrix3d with prefixes
// THANK YOU MvG http://math.stackexchange.com/a/339033/78081
// prettier-ignore
function quadWarpMatrix (left, top, w, h, xTL, yTL, xTR, yTR, xBL, yBL, xBR, yBR) {

  function adj(m) { // Compute the adjugate of m
    return [
      m[4]*m[8]-m[5]*m[7], m[2]*m[7]-m[1]*m[8], m[1]*m[5]-m[2]*m[4],
      m[5]*m[6]-m[3]*m[8], m[0]*m[8]-m[2]*m[6], m[2]*m[3]-m[0]*m[5],
      m[3]*m[7]-m[4]*m[6], m[1]*m[6]-m[0]*m[7], m[0]*m[4]-m[1]*m[3]
    ];
  }
  function multmm(a, b) { // multiply two matrices
    var c = Array(9);
    for (var i = 0; i != 3; ++i) {
      for (var j = 0; j != 3; ++j) {
        var cij = 0;
        for (var k = 0; k != 3; ++k) {
          cij += a[3*i + k]*b[3*k + j];
        }
        c[3*i + j] = cij;
      }
    }
    return c;
  }
  function multmv(m, v) { // multiply matrix and vector
    return [
      m[0]*v[0] + m[1]*v[1] + m[2]*v[2],
      m[3]*v[0] + m[4]*v[1] + m[5]*v[2],
      m[6]*v[0] + m[7]*v[1] + m[8]*v[2]
    ];
  }
  function pdbg(m, v) {
    var r = multmv(m, v);
    return r + " (" + r[0]/r[2] + ", " + r[1]/r[2] + ")";
  }
  function basisToPoints(x1, y1, x2, y2, x3, y3, x4, y4) {
    var m = [
      x1, x2, x3,
      y1, y2, y3,
        1,  1,  1
    ];
    var v = multmv(adj(m), [x4, y4, 1]);
    return multmm(m, [
      v[0], 0, 0,
      0, v[1], 0,
      0, 0, v[2]
    ]);
  }
  function general2DProjection(
    x1s, y1s, x1d, y1d,
    x2s, y2s, x2d, y2d,
    x3s, y3s, x3d, y3d,
    x4s, y4s, x4d, y4d
  ) {
    var s = basisToPoints(x1s, y1s, x2s, y2s, x3s, y3s, x4s, y4s);
    var d = basisToPoints(x1d, y1d, x2d, y2d, x3d, y3d, x4d, y4d);
    return multmm(d, adj(s));
  }
  function project(m, x, y) {
    var v = multmv(m, [x, y, 1]);
    return [v[0]/v[2], v[1]/v[2]];
  }

  function matrix3d(left, top, w, h, x1, y1, x2, y2, x3, y3, x4, y4) {
    // var w = elt.offsetWidth, h = elt.offsetHeight;
    var t = general2DProjection(
      left, top,         x1, y1,
      left + w, top,     x2, y2,
      left, top + h,     x3, y3,
      left + w, top + h, x4, y4
    );
    for (let i = 0; i != 9; ++i) t[i] = t[i]/t[8];
    t = [t[0], t[3], 0, t[6],
          t[1], t[4], 0, t[7],
          0   , 0   , 1, 0   ,
          t[2], t[5], 0, t[8]];
    t = "matrix3d(" + t.join(", ") + ")";
    return t;
  }

  function prefixTransform(val) {
    return {
      "-webkit-transform": val,
      "-moz-transform": val,
      "-o-transform": val,
      "transform": val
    };
  }

  return matrix3d(left, top, w, h, xTL, yTL, xTR, yTR, xBL, yBL, xBR, yBR);

}

class MmQuadwarp extends HTMLElement {
  constructor() {
    super();
    this.xtl = Number(this.getAttribute("xtl"));
    this.ytl = Number(this.getAttribute("ytl"));
    this.xtr = Number(this.getAttribute("xtr"));
    this.ytr = Number(this.getAttribute("ytr"));
    this.xbl = Number(this.getAttribute("xbl"));
    this.ybl = Number(this.getAttribute("ybl"));
    this.xbr = Number(this.getAttribute("xbr"));
    this.ybr = Number(this.getAttribute("ybr"));
  }
  static get observedAttributes() {
    return ["xtl", "ytl", "xtr", "ytr", "xbl", "ybl", "xbr", "ybr"];
  }
  mmManifest() {
    return {
      name: "MmQuadwarp",
      tagName: "mm-quadwarp",
      members: [
        { kind: "field", name: "xtl", type: "number" },
        { kind: "field", name: "ytl", type: "number" },
        { kind: "field", name: "xtr", type: "number" },
        { kind: "field", name: "ytr", type: "number" },
        { kind: "field", name: "xbr", type: "number" },
        { kind: "field", name: "ybr", type: "number" },
        { kind: "field", name: "xbl", type: "number" },
        { kind: "field", name: "ybl", type: "number" },
      ],
    };
  }

  connectedCallback() {
    this.setChildTransform();
  }

  disconnectedCallback() {}
  attributeChangedCallback(name, oldValue, newValue) {
    this[name] = Number(newValue);
    this.setChildTransform();
  }

  setChildTransform() {
    const firstChild = this.children[0];
    console.log(firstChild.offsetLeft, firstChild.offsetTop);

    firstChild.style.display = "block";
    firstChild.style.position = "absolute";
    firstChild.style.left = "0px";
    firstChild.style.top = "0px";

    const left = firstChild.offsetLeft;
    const top = firstChild.offsetTop;
    const w = firstChild.offsetWidth;
    const h = firstChild.offsetHeight;
    const transform = quadWarpMatrix(
      left,
      top,
      w,
      h,
      this.xtl,
      this.ytl,
      this.xtr,
      this.ytr,
      this.xbl,
      this.ybl,
      this.xbr,
      this.ybr
    );
    firstChild.style.transformOrigin = "0 0";
    firstChild.style.transform = transform;
  }
}

customElements.define("mm-quadwarp", MmQuadwarp);
