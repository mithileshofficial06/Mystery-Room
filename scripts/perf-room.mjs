/**
 * Frame-time and draw-call probe for the Mystery Room.
 *
 *   npm run perf                      # needs a dev server on :3000
 *   npm run perf -- http://localhost:3100/
 *
 * WHAT TO READ AND WHAT TO IGNORE. Headless Chromium renders WebGL on the CPU
 * through SwiftShader, so `approxFps` and `medianFrameMs` say nothing whatever
 * about a real machine — they are two orders of magnitude out and they move
 * with whatever else the host is doing. Do not tune against them.
 *
 * `drawCallsPerFrame` is the number worth having. It is what the CPU submits
 * per frame, it is identical on every GPU, and in this room it is the thing
 * that was wrong: 1221 calls to draw 25k triangles is about 21 triangles per
 * call, which is the signature of a scene built out of several hundred separate
 * small meshes. Freezing the static shadow map took it to 803. Halving it again
 * means merging or instancing scenery, which has not been done.
 *
 * A note on what this cannot see: `dpr` and `antialias` are fragment-side costs
 * and this probe runs at devicePixelRatio 1, so capping them — the largest real
 * win on a HiDPI laptop — does not show up here at all. Absence of a number is
 * not absence of an effect.
 *
 * Draw calls are counted by wrapping the WebGL draw entry points before any
 * page script runs, rather than by reaching into R3F's store. The store's shape
 * is a private detail that moves between versions; `drawElements` has not moved
 * since 2011.
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3000/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });

await page.addInitScript(() => {
  const counters = { calls: 0, triangles: 0, frames: 0 };
  window.__perf = counters;

  for (const proto of [
    window.WebGLRenderingContext?.prototype,
    window.WebGL2RenderingContext?.prototype,
  ]) {
    if (!proto) continue;

    const drawElements = proto.drawElements;
    proto.drawElements = function (mode, count, ...rest) {
      counters.calls += 1;
      if (mode === this.TRIANGLES) counters.triangles += count / 3;
      return drawElements.call(this, mode, count, ...rest);
    };

    const drawArrays = proto.drawArrays;
    proto.drawArrays = function (mode, first, count, ...rest) {
      counters.calls += 1;
      if (mode === this.TRIANGLES) counters.triangles += count / 3;
      return drawArrays.call(this, mode, first, count, ...rest);
    };
  }
});

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas");
// Let the scene settle: every material compiles its shader the first time it
// is seen, and those frames are not representative of the steady state.
await page.waitForTimeout(9000);

const stats = await page.evaluate(async () => {
  const p = window.__perf;
  const before = { calls: p.calls, triangles: p.triangles };
  const start = performance.now();

  const frames = await new Promise((resolve) => {
    const times = [];
    let last = performance.now();
    const tick = (now) => {
      times.push(now - last);
      last = now;
      if (times.length >= 60) return resolve(times);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const elapsed = performance.now() - start;
  const drawn = p.calls - before.calls;
  const tris = p.triangles - before.triangles;

  const sorted = [...frames].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  return {
    framesSampled: frames.length,
    drawCallsPerFrame: Math.round(drawn / frames.length),
    trianglesPerFrame: Math.round(tris / frames.length),
    medianFrameMs: +median.toFixed(1),
    approxFps: +(1000 / median).toFixed(1),
    wallClockMs: Math.round(elapsed),
    devicePixelRatio: window.devicePixelRatio,
    canvasPixels: (() => {
      const c = document.querySelector("canvas");
      return c ? `${c.width}x${c.height}` : null;
    })(),
  };
});

console.log(JSON.stringify(stats, null, 2));
await browser.close();
