import { MINDAR_VERSION } from "./mindar";

interface TrackerPageOptions {
  /** A compiled `.mind` file, base64. */
  targetsMind: string;
  /** Color of the corner marks drawn on a found target. */
  markColor: string;
}

/**
 * The page inside the WebView (native) or iframe (web): camera, MindAR image
 * tracking, and gold corner marks drawn over the target. It only sees; the app
 * owns everything a person reads or hears, and gets `TrackerEvent`s as JSON.
 *
 * MindAR's core (`Controller`) is used without its three.js layer: the corners
 * are projected from the pose it returns, so nothing 3D is loaded.
 */
export function trackerPageHtml({ targetsMind, markColor }: TrackerPageOptions): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #000; }
  video, canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  video { object-fit: cover; }
</style>
</head>
<body>
<video id="video" autoplay muted playsinline></video>
<canvas id="marks"></canvas>
<script type="module">
const post = (event) => {
  const data = JSON.stringify(event);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
  else window.parent.postMessage(data, "*");
};
const fail = (reason, error) => post({ type: "error", reason, message: String(error && error.message || error) });
const step = (name) => post({ type: "step", step: name });
window.addEventListener("unhandledrejection", (event) => fail("unknown", event.reason));
step("page");

const video = document.getElementById("video");
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

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientHeight * ratio;
}
window.addEventListener("resize", resizeCanvas);

async function start() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    fail("camera-unsupported", "getUserMedia is not available");
    return;
  }

  let Controller;
  try {
    ({ Controller } = await import("https://cdn.jsdelivr.net/npm/mind-ar@${MINDAR_VERSION}/dist/mindar-image.prod.js"));
  } catch (error) {
    fail("load-failed", error);
    return;
  }
  step("library");

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
  let frames = 0;
  const controller = new Controller({
    inputWidth: video.videoWidth,
    inputHeight: video.videoHeight,
    maxTrack: 1,
    onUpdate: ({ type, targetIndex, worldMatrix }) => {
      if (type === "processDone") {
        frames += 1;
        return;
      }
      if (type !== "updateMatrix") return;
      if (worldMatrix) {
        const [width, height] = dimensions[targetIndex];
        const corners = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => toCanvas(project(worldMatrix, height, x, y)));
        drawCorners(corners);
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

  const binary = atob(${JSON.stringify(targetsMind)});
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  ({ dimensions } = controller.addImageTargetsFromBuffer(bytes.buffer));
  step("targets");

  await controller.dummyRun(video);
  post({ type: "ready", videoWidth: video.videoWidth, videoHeight: video.videoHeight });
  controller.processVideo(video);

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
