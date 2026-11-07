interface TrackerPageOptions {
  /** What to look for: a compiled `.mind` file (base64), or a photo URL the page compiles itself. */
  target: TrackerTarget;
  /** Color of the corner marks drawn on a found target. */
  markColor: string;
  /**
   * Text drawn over each target while it is in view, by target index (Taşın Dili's translation).
   * Only a picture: the screen around the camera has the same text for screen readers.
   */
  overlays?: readonly (string | null)[];
  /** MindAR, inlined so the page needs no network (`loadMindar` in @/vendor). */
  mindarScript: string;
  /** The app's heading font, Marcellus (base64 TrueType), for the overlay text; without it, a system serif. */
  overlayFont?: string | undefined;
  /** Draw gold corners on a found target. Off where the app shows its own sign (Ziyaret Mührü). */
  marks?: boolean | undefined;
  /** Post where a found target lies on the screen ("pose"), a few times a second. */
  poses?: boolean | undefined;
}

/**
 * A compiled `.mind` file, or one photo to compile on the device. Compiling takes a few seconds,
 * but no `.mind` file has to be built and hosted for every asset (Ziyaret Mührü).
 */
type TargetSource = { mind: string } | { image: string };

/**
 * One target, or several `sources` tracked as one set: their `.mind` files and the photos
 * compiled on the device are joined, in this order, so a found target's index is its place here.
 */
export type TrackerTarget = TargetSource | { sources: TargetSource[] };

/**
 * The page inside the WebView (native) or iframe (web): camera, MindAR image
 * tracking, and gold corner marks drawn over the target. It only sees; the app
 * owns everything a person reads or hears, and gets `TrackerEvent`s as JSON.
 *
 * On `capture` it freezes the picture and looks for the targets again in that one frame
 * (a "captured" event); `resume` lets the camera run on. The app sends them as
 * `TrackerCommand`s: injected on native, posted into the iframe on the web.
 *
 * MindAR's core (`Controller`) is used without its three.js layer: the corners
 * are projected from the pose it returns, so nothing 3D is loaded.
 */
export function trackerPageHtml({ target, markColor, overlays = [], mindarScript, overlayFont, marks = true, poses = false }: TrackerPageOptions): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #000; }
  video, canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  video, #still { object-fit: cover; }
  #still { display: none; }
${overlayFont ? `  @font-face { font-family: "Marcellus"; src: url(data:font/ttf;base64,${overlayFont}) format("truetype"); }\n` : ""}</style>
</head>
<body>
<video id="video" autoplay muted playsinline></video>
<canvas id="still"></canvas>
<script>${mindarScript}</script>
<canvas id="marks"></canvas>
<script type="module">
const post = (event) => {
  const data = JSON.stringify(event);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
  else window.parent.postMessage(data, "*");
};
// Commands from the app, set once the tracker runs: injected on native, posted into the iframe on the web.
const commands = {};
window.__trackerCommand = (name) => commands[name] && commands[name]();
window.addEventListener("message", (message) => {
  if (message.source !== window.parent || typeof message.data !== "string") return;
  try {
    window.__trackerCommand(JSON.parse(message.data).command);
  } catch {}
});
const fail = (reason, error) => post({ type: "error", reason, message: String(error && error.message || error) });
const step = (name) => post({ type: "step", step: name });
window.addEventListener("unhandledrejection", (event) => fail("unknown", event.reason));
step("page");

const video = document.getElementById("video");
// The frame a photo stops on, laid over the video: the video runs on under it, and a resume only
// takes it away.
const still = document.getElementById("still");
const canvas = document.getElementById("marks");
const context = canvas.getContext("2d");

function cameraFailure(error) {
  if (error.name === "NotAllowedError" || error.name === "SecurityError") return "camera-denied";
  if (error.name === "NotFoundError" || error.name === "NotReadableError" || error.name === "OverconstrainedError") return "camera-unavailable";
  return "unknown";
}

// MindAR's world matrix is an OpenGL model-view matrix (column-major, y and z flipped).
// Undo that to get the pose in marker pixels (y down), then project with the camera
// matrix MindAR assumes: f from a 45° vertical field of view, center at the middle.
function project(world, markerHeight, x, y) {
  const m00 = world[0], m10 = -world[1], m20 = -world[2];
  const m01 = -world[4], m11 = world[5], m21 = world[6];
  const m03 = world[12] - m01 * markerHeight;
  const m13 = -world[13] - m11 * markerHeight;
  const m23 = -world[14] - m21 * markerHeight;
  const X = m00 * x + m01 * y + m03;
  const Y = m10 * x + m11 * y + m13;
  const Z = m20 * x + m21 * y + m23;
  const f = video.videoHeight / 2 / Math.tan(Math.PI / 8);
  return [f * X / Z + video.videoWidth / 2, f * Y / Z + video.videoHeight / 2];
}

// Video pixels to canvas pixels, matching object-fit: cover.
function toCanvas([u, v]) {
  const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
  return [(u - video.videoWidth / 2) * scale + canvas.width / 2, (v - video.videoHeight / 2) * scale + canvas.height / 2];
}

function drawCorners(corners) {
  const ratio = window.devicePixelRatio || 1;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = ${JSON.stringify(markColor)};
  context.lineWidth = 3 * ratio;
  context.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const [x, y] = corners[i];
    const towards = (j) => {
      const [tx, ty] = corners[j];
      const length = Math.hypot(tx - x, ty - y) || 1;
      const arm = Math.min(28 * ratio, length / 3);
      return [x + (tx - x) / length * arm, y + (ty - y) / length * arm];
    };
    const [ax, ay] = towards((i + 1) % 4);
    const [bx, by] = towards((i + 3) % 4);
    context.beginPath();
    context.moveTo(ax, ay);
    context.lineTo(x, y);
    context.lineTo(bx, by);
    context.stroke();
  }
}

// Lines of text that fit \`maxWidth\` at the context's font.
function wrap(text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? line + " " + word : word;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// A dark plate over the target with the text on it, laid on the target's plane: drawn in
// target pixels, mapped by the affine transform of three corners (close enough to the
// perspective at reading distance), so it moves and tilts with the stone.
const overlays = ${JSON.stringify(overlays).replaceAll("</", "<\\/")};
function drawOverlay(corners, width, height, text) {
  const [p0, p1, , p3] = corners;
  const a = (p1[0] - p0[0]) / width, b = (p1[1] - p0[1]) / width;
  const c = (p3[0] - p0[0]) / height, d = (p3[1] - p0[1]) / height;
  const det = a * d - b * c;
  if (!det) return;
  context.save();
  context.setTransform(a, b, c, d, p0[0], p0[1]);
  context.fillStyle = "rgba(10, 12, 18, 0.72)";
  context.beginPath();
  // roundRect is missing in older WebViews (iOS 15); a throw here would stop the tracking loop.
  if (context.roundRect) context.roundRect(0, 0, width, height, width * 0.03);
  else context.rect(0, 0, width, height);
  context.fill();
  // The text goes in the part of the target on screen: a wide inscription held close in a
  // portrait phone runs past the screen's sides. The screen's corners, back on the target's plane.
  const back = ([x, y]) => [(d * (x - p0[0]) - c * (y - p0[1])) / det, (-b * (x - p0[0]) + a * (y - p0[1])) / det];
  const seen = [[0, 0], [canvas.width, 0], [canvas.width, canvas.height], [0, canvas.height]].map(back);
  const left = Math.max(0, Math.min(...seen.map((p) => p[0])));
  const right = Math.min(width, Math.max(...seen.map((p) => p[0])));
  const top = Math.max(0, Math.min(...seen.map((p) => p[1])));
  const bottom = Math.min(height, Math.max(...seen.map((p) => p[1])));
  const boxWidth = right - left, boxHeight = bottom - top;
  if (boxWidth <= 0 || boxHeight <= 0) return context.restore();
  const pad = boxWidth * 0.06;
  // The largest size whose lines fit, down to a floor; past that the last line ends in "…".
  // \`size\` stays the size last set, so the spacing below matches the font drawn.
  const floor = boxWidth / 30;
  let size = boxWidth / 12;
  let lines = [];
  for (;;) {
    context.font = size + 'px "Marcellus", Georgia, serif';
    lines = wrap(text, boxWidth - 2 * pad);
    if (lines.length * size * 1.3 <= boxHeight - 2 * pad || size * 0.9 < floor) break;
    size *= 0.9;
  }
  const fit = Math.max(1, Math.floor((boxHeight - 2 * pad) / (size * 1.3)));
  if (lines.length > fit) lines = [...lines.slice(0, fit - 1), lines[fit - 1] + "…"];
  context.fillStyle = "#fff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const first = (top + bottom) / 2 - ((lines.length - 1) * size * 1.3) / 2;
  lines.forEach((line, i) => context.fillText(line, (left + right) / 2, first + i * size * 1.3));
  context.restore();
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// The still sent to the assistant: as wide as the photos Taşa Sor sends, and as compressed.
const SNAPSHOT_WIDTH = 1024;
const SNAPSHOT_QUALITY = 0.7;

// Poses are posted this often at most: enough to guide a hand, little for the bridge to carry.
const POSE_EVERY_MS = 150;

// A slow connection must not leave the screen at "preparing" for good: past this the photo counts as not downloaded.
const IMAGE_TIMEOUT_MS = 20000;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => {
      image.src = "";
      reject(new Error("Timed out loading " + src));
    }, IMAGE_TIMEOUT_MS);
    // Read back by the compiler through a canvas: without CORS the canvas is tainted.
    image.crossOrigin = "anonymous";
    image.onload = () => {
      clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Could not load " + src));
    };
    image.src = src;
  });
}

// The targets' .mind data: given, or compiled here from the photos before the camera opens.
// Several sources are joined into one set: MindAR's controller loads a single .mind file.
async function targetBuffer(library) {
  const target = ${JSON.stringify(target)};
  if (target.mind) return fromBase64(target.mind);
  const sources = target.sources || [target];
  const photos = sources.filter((source) => source.image).length;
  if (photos > 0) step("compile");
  const data = [];
  let compiled = 0;
  let reported = -1;
  for (const source of sources) {
    if (source.mind) {
      // An outdated file comes back empty: the targets after it would take the wrong index.
      const imported = new library.Compiler().importData(fromBase64(source.mind));
      if (imported.length === 0) {
        fail("load-failed", "A .mind file of another MindAR release");
        return null;
      }
      data.push(...imported);
      continue;
    }
    let image;
    try {
      image = await loadImage(source.image);
    } catch (error) {
      fail("image-unavailable", error);
      return null;
    }
    const compiler = new library.Compiler();
    // Progress over all the photos, in steps of 5 %.
    await compiler.compileImageTargets([image], (progress) => {
      const percent = Math.floor((compiled * 100 + progress) / photos / 5) * 5;
      if (percent !== reported) {
        reported = percent;
        post({ type: "compile", progress: percent / 100 });
      }
    });
    compiled += 1;
    data.push(...compiler.data);
  }
  const joined = new library.Compiler();
  joined.data = data;
  const bytes = new Uint8Array(await joined.exportData());
  if (photos > 0 || sources.length > 1) post({ type: "compiled", mind: toBase64(bytes) });
  return bytes.buffer;
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientHeight * ratio;
}
window.addEventListener("resize", resizeCanvas);

async function start() {
  // A canvas does not load a font by itself; the overlay is drawn every frame, so once this is in it is used.
  if (document.fonts) document.fonts.load('16px "Marcellus"').catch(() => {});
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    fail("camera-unsupported", "getUserMedia is not available");
    return;
  }

  const library = window.MINDAR && window.MINDAR.IMAGE;
  if (!library) {
    fail("load-failed", "MindAR did not load");
    return;
  }
  const { Controller } = library;
  step("library");

  const targets = await targetBuffer(library);
  if (!targets) return;

  let stream;
  try {
    // A WebView that never answers the page's camera request leaves this pending forever.
    const timeout = new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("getUserMedia did not answer in 10 s"), { name: "NotReadableError" })), 10000));
    stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      }),
      timeout,
    ]);
  } catch (error) {
    fail(cameraFailure(error), error);
    return;
  }
  window.addEventListener("pagehide", () => stream.getTracks().forEach((track) => track.stop()));
  step("camera");

  video.srcObject = stream;
  await new Promise((resolve) => (video.onloadedmetadata = resolve));
  try {
    await video.play();
  } catch (error) {
    fail("unknown", error);
    return;
  }
  step("video");
  // MindAR draws the frame at the element's width and height attributes, which a
  // <video> leaves at 0 (its own three.js layer sets them): without this it sees nothing.
  video.width = video.videoWidth;
  video.height = video.videoHeight;
  resizeCanvas();

  let dimensions = [];
  let showing = -1;
  let posed = 0;
  let frames = 0;
  /** Resolves the next time the tracker finishes a frame: one is in flight when it is stopped. */
  let frameDone = null;
  const controller = new Controller({
    inputWidth: video.videoWidth,
    inputHeight: video.videoHeight,
    maxTrack: 1,
    onUpdate: ({ type, targetIndex, worldMatrix }) => {
      if (type === "processDone") {
        frames += 1;
        if (frameDone) frameDone();
        return;
      }
      if (type !== "updateMatrix") return;
      if (worldMatrix) {
        const [width, height] = dimensions[targetIndex];
        const corners = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => toCanvas(project(worldMatrix, height, x, y)));
        if (${marks}) drawCorners(corners);
        if (overlays[targetIndex]) drawOverlay(corners, width, height, overlays[targetIndex]);
        // Where the target lies, as fractions of the view: the app compares it with what it shows.
        if (${poses} && performance.now() - posed > POSE_EVERY_MS) {
          posed = performance.now();
          post({ type: "pose", target: targetIndex, corners: corners.map(([x, y]) => [x / canvas.width, y / canvas.height]) });
        }
        if (showing !== targetIndex) {
          showing = targetIndex;
          post({ type: "found", target: targetIndex });
        }
      } else if (showing === targetIndex) {
        showing = -1;
        context.clearRect(0, 0, canvas.width, canvas.height);
        post({ type: "lost", target: targetIndex });
      }
    },
  });

  ({ dimensions } = controller.addImageTargetsFromBuffer(targets));
  step("targets");

  await controller.dummyRun(video);
  post({ type: "ready", videoWidth: video.videoWidth, videoHeight: video.videoHeight });
  controller.processVideo(video);

  // The photo: the picture stops on the frame, the tracker stops with it, and that one frame is
  // searched again from scratch. Only a frame that shows the target counts, not a glimpse before it.
  let frozen = false;
  const holdFrame = () => {
    still.width = video.videoWidth;
    still.height = video.videoHeight;
    still.getContext("2d").drawImage(video, 0, 0, still.width, still.height);
    still.style.display = "block";
  };
  commands.capture = async () => {
    if (frozen) return;
    frozen = true;
    const started = performance.now();
    holdFrame();
    controller.stopProcessVideo();
    await new Promise((resolve) => {
      frameDone = resolve;
      setTimeout(resolve, 300);
    });
    frameDone = null;
    try {
      // The frame on screen, not the video, which has run on.
      const { featurePoints } = await controller.detect(still);
      let target = null;
      for (let index = 0; index < dimensions.length && target === null; index++) {
        const { modelViewTransform } = await controller.match(featurePoints, index);
        if (modelViewTransform) target = index;
      }
      post({ type: "captured", target, ms: Math.round(performance.now() - started) });
    } catch (error) {
      post({ type: "captured", target: null, ms: Math.round(performance.now() - started), error: String(error && error.message || error) });
    }
  };
  // A still for the assistant: the picture stops on the frame, which goes to the app as a JPEG.
  commands.snapshot = async () => {
    // No frame yet (the camera has not sent one): nothing to send, said as such.
    if (!video.videoWidth) {
      post({ type: "snapshot", jpeg: null, error: "no frame yet" });
      return;
    }
    if (!frozen) {
      frozen = true;
      holdFrame();
      controller.stopProcessVideo();
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    try {
      // The frame on screen (taken by a capture, or just now), not the video, which runs on.
      const scale = Math.min(1, SNAPSHOT_WIDTH / still.width);
      const frame = document.createElement("canvas");
      frame.width = Math.round(still.width * scale);
      frame.height = Math.round(still.height * scale);
      frame.getContext("2d").drawImage(still, 0, 0, frame.width, frame.height);
      post({ type: "snapshot", jpeg: frame.toDataURL("image/jpeg", SNAPSHOT_QUALITY).split(",")[1] });
    } catch (error) {
      post({ type: "snapshot", jpeg: null, error: String(error && error.message || error) });
    }
  };
  commands.resume = () => {
    if (!frozen) return;
    frozen = false;
    showing = -1;
    context.clearRect(0, 0, canvas.width, canvas.height);
    still.style.display = "none";
    controller.processVideo(video);
  };

  setInterval(() => {
    post({ type: "stats", fps: frames / 2 });
    frames = 0;
  }, 2000);
}

start().catch((error) => fail("unknown", error));
</script>
</body>
</html>`;
}
