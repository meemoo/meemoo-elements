import assert from "node:assert/strict";
import test from "node:test";
import { installDOM } from "./dom.js";

installDOM();
const { MmWebcam } = await import("../src/mm-webcam.js");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mediaStream(deviceId = "camera") {
  const videoTrack = {
    stops: 0,
    stop() {
      this.stops++;
    },
    getSettings() {
      return { deviceId, frameRate: 24 };
    },
  };
  const audioTrack = {
    stops: 0,
    stop() {
      this.stops++;
    },
  };
  return {
    tracks: [videoTrack, audioTrack],
    getTracks() {
      return this.tracks;
    },
    getVideoTracks() {
      return [videoTrack];
    },
  };
}

function webcam(t, getUserMedia) {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator"
  );
  const originalRAF = globalThis.requestAnimationFrame;
  const frames = [];
  const mediaDevices = {
    getUserMedia,
    enumerateDevices: async () => [
      { kind: "videoinput", label: "Camera", deviceId: "camera" },
      { kind: "audioinput", label: "Microphone", deviceId: "microphone" },
    ],
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices },
  });
  globalThis.requestAnimationFrame = (callback) => frames.push(callback);
  t.after(() => {
    globalThis.requestAnimationFrame = originalRAF;
    if (navigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
  });
  const camera = new MmWebcam();
  camera.videoEl = Object.assign(new EventTarget(), {
    srcObject: null,
    videoWidth: 640,
    currentTime: 0,
    removeAttribute(name) {
      delete this[name];
    },
  });
  t.after(() => camera.stop());
  return { camera, frames, mediaDevices };
}

test("start returns the acquired stream and applies its settings", async (t) => {
  const stream = mediaStream();
  let constraints;
  const { camera } = webcam(t, async (value) => {
    constraints = value;
    return stream;
  });
  const promise = camera.start();
  assert.ok(promise instanceof Promise);
  assert.equal(await promise, stream);
  assert.deepEqual(constraints, { video: true, audio: false });
  assert.equal(camera.stream, stream);
  assert.equal(camera.videoEl.srcObject, stream);
  assert.equal(camera.camId, "camera");
  assert.equal(camera.frameRate, 24);
  assert.deepEqual(camera.cameras, [{ label: "Camera", value: "camera" }]);
});

test("stop releases all tracks once, clears the video, and invalidates frames", async (t) => {
  const stream = mediaStream();
  const { camera, frames } = webcam(t, async () => stream);
  let emitted = 0;
  camera.addEventListener("stream", () => emitted++);
  await camera.start();
  assert.equal(frames.length, 1);
  camera.stop();
  camera.stop();
  assert.deepEqual(stream.tracks.map((track) => track.stops), [1, 1]);
  assert.equal(camera.stream, null);
  assert.equal(camera.videoEl.srcObject, null);
  frames[0](100);
  assert.equal(emitted, 0);
  assert.equal(frames.length, 1);
});

for (const cancel of ["stop", "disconnectedCallback"]) {
  test(`${cancel} cancels acquisition and releases late tracks`, async (t) => {
    const acquisition = deferred();
    const stream = mediaStream();
    const { camera, frames } = webcam(t, () => acquisition.promise);
    const pending = camera.start();
    camera[cancel]();
    acquisition.resolve(stream);
    assert.equal(await pending, undefined);
    assert.deepEqual(stream.tracks.map((track) => track.stops), [1, 1]);
    assert.equal(camera.stream, null);
    assert.equal(camera.videoEl.srcObject, null);
    assert.equal(frames.length, 0);
  });
}

test("disconnect releases an active stream and invalidates its loop", async (t) => {
  const stream = mediaStream();
  const { camera, frames } = webcam(t, async () => stream);
  await camera.start();
  camera.disconnectedCallback();
  assert.equal(camera.stream, null);
  assert.equal(camera.videoEl.srcObject, null);
  assert.deepEqual(stream.tracks.map((track) => track.stops), [1, 1]);
  frames[0](100);
  assert.equal(frames.length, 1);
});

test("a superseded acquisition cannot replace or stop the latest stream", async (t) => {
  const first = deferred();
  const second = deferred();
  const oldStream = mediaStream("old");
  const newStream = mediaStream("new");
  let calls = 0;
  const { camera } = webcam(t, () => (++calls === 1 ? first : second).promise);
  const oldStart = camera.start();
  const newStart = camera.start();
  second.resolve(newStream);
  assert.equal(await newStart, newStream);
  first.resolve(oldStream);
  assert.equal(await oldStart, undefined);
  assert.deepEqual(oldStream.tracks.map((track) => track.stops), [1, 1]);
  assert.deepEqual(newStream.tracks.map((track) => track.stops), [0, 0]);
  assert.equal(camera.stream, newStream);
  assert.equal(camera.videoEl.srcObject, newStream);
});

test("a superseded failure is cancelled without disturbing the latest stream", async (t) => {
  const first = deferred();
  const stream = mediaStream();
  let calls = 0;
  const { camera } = webcam(t, () =>
    ++calls === 1 ? first.promise : Promise.resolve(stream)
  );
  const oldStart = camera.start();
  await camera.start();
  first.reject(new Error("obsolete permission failure"));
  assert.equal(await oldStart, undefined);
  assert.equal(camera.stream, stream);
  assert.deepEqual(stream.tracks.map((track) => track.stops), [0, 0]);
});

test("restarting an active stream stops it before attaching the replacement", async (t) => {
  const first = mediaStream("first");
  const second = mediaStream("second");
  let calls = 0;
  const { camera } = webcam(t, async () => (++calls === 1 ? first : second));
  await camera.start();
  assert.equal(await camera.start(), second);
  assert.deepEqual(first.tracks.map((track) => track.stops), [1, 1]);
  assert.equal(camera.stream, second);
  assert.equal(camera.videoEl.srcObject, second);
});

test("a rejected acquisition after stop resolves as cancellation", async (t) => {
  const acquisition = deferred();
  const { camera } = webcam(t, () => acquisition.promise);
  const pending = camera.start();
  camera.stop();
  acquisition.reject(new Error("permission denied after cancellation"));
  assert.equal(await pending, undefined);
  assert.equal(camera.stream, null);
});

test("start rejects permission failures and synchronous acquisition failures", async (t) => {
  const failure = new Error("permission denied");
  const { camera, mediaDevices } = webcam(t, async () => {
    throw failure;
  });
  await assert.rejects(camera.start(), (error) => error === failure);
  assert.equal(camera.stream, null);
  assert.equal(camera.videoEl.srcObject, null);
  mediaDevices.getUserMedia = () => {
    throw failure;
  };
  await assert.rejects(camera.start(), (error) => error === failure);
  delete mediaDevices.getUserMedia;
  await assert.rejects(camera.start(), TypeError);
});

test("a setup failure rejects and releases the acquired stream", async (t) => {
  const stream = mediaStream();
  const failure = new Error("settings failed");
  stream.getVideoTracks()[0].getSettings = () => {
    throw failure;
  };
  const { camera } = webcam(t, async () => stream);
  await assert.rejects(camera.start(), (error) => error === failure);
  assert.deepEqual(stream.tracks.map((track) => track.stops), [1, 1]);
  assert.equal(camera.stream, null);
  assert.equal(camera.videoEl.srcObject, null);
});

test("camId restart failures are handled and reported once", async (t) => {
  const stream = mediaStream();
  const failure = new Error("requested camera unavailable");
  let calls = 0;
  const { camera } = webcam(t, async () => {
    if (++calls === 1) return stream;
    throw failure;
  });
  await camera.start();
  const errors = [];
  camera.addEventListener("error", (event) => errors.push(event.detail));
  const reported = new Promise((resolve) =>
    camera.addEventListener("error", resolve, { once: true })
  );
  camera.camId = "missing";
  await reported;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, [failure]);
  assert.deepEqual(stream.tracks.map((track) => track.stops), [1, 1]);
  assert.equal(camera.stream, null);
  camera.camId = "another";
  assert.equal(calls, 2, "changing camId does not restart a stopped stream");
});

test("camId changes supersede pending acquisition but do not restart after stop", async (t) => {
  const first = deferred();
  const second = deferred();
  const oldStream = mediaStream("old");
  const newStream = mediaStream("new");
  const constraints = [];
  const { camera } = webcam(t, (value) => {
    constraints.push(value);
    return constraints.length === 1 ? first.promise : second.promise;
  });
  const pending = camera.start();
  camera.camId = "new";
  assert.deepEqual(constraints[1], {
    video: { deviceId: "new" },
    audio: false,
  });
  second.resolve(newStream);
  await second.promise;
  first.resolve(oldStream);
  assert.equal(await pending, undefined);
  assert.equal(camera.stream, newStream);
  assert.deepEqual(oldStream.tracks.map((track) => track.stops), [1, 1]);
  camera.stop();
  camera.camId = "third";
  assert.equal(constraints.length, 2);
});

test("clearing camId cancels an active or pending stream", async (t) => {
  const first = mediaStream();
  const pendingAcquisition = deferred();
  let calls = 0;
  const { camera } = webcam(t, () =>
    ++calls === 1 ? Promise.resolve(first) : pendingAcquisition.promise
  );
  await camera.start();
  camera.camId = null;
  assert.equal(camera.stream, null);
  assert.equal(camera.videoEl.srcObject, null);
  assert.deepEqual(first.tracks.map((track) => track.stops), [1, 1]);
  const pending = camera.start();
  camera.camId = null;
  const late = mediaStream();
  pendingAcquisition.resolve(late);
  assert.equal(await pending, undefined);
  assert.deepEqual(late.tracks.map((track) => track.stops), [1, 1]);
});

test("enumeration failures emit an error with Error detail", async (t) => {
  const { camera, mediaDevices } = webcam(t, async () => mediaStream());
  const errors = [];
  camera.addEventListener("error", (event) => errors.push(event.detail));
  const failure = new Error("enumeration denied");
  mediaDevices.enumerateDevices = async () => {
    throw failure;
  };
  await camera.enumerateDevices();
  assert.deepEqual(errors, [failure]);
  mediaDevices.enumerateDevices = () => {
    throw "enumeration failed";
  };
  await camera.enumerateDevices();
  assert.equal(errors.length, 2);
  assert.ok(errors[1] instanceof Error);
  assert.equal(errors[1].message, "enumeration failed");
});
