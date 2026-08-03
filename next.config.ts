import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * OFF, and it has to stay off while this app renders a Canvas.
   *
   * StrictMode deliberately mounts, unmounts and remounts every component in
   * development. react-three-fiber's Canvas disposes its WebGLRenderer on
   * unmount, and disposal calls forceContextLoss() on the canvas element —
   * but React reuses that same <canvas> DOM node for the remount, so the
   * second renderer comes up attached to a context that has been deliberately
   * destroyed.
   *
   * The symptom is unusually bad: exactly one frame renders, then the canvas
   * goes black and stays black. Nothing throws, no error boundary fires, the
   * DOM overlay carries on drawing over the top, and the only clue anywhere
   * is a "THREE.WebGLRenderer: Context Lost." line in the console. It is a
   * development-only fault — a production build never double-mounts — which
   * makes it exactly the kind of thing that eats an afternoon.
   *
   * Note also: do NOT add `transpilePackages: ["three"]`. three ships ESM that
   * Next resolves on its own, and forcing it through transpilation gives the
   * app a second copy of the module separate from the one @react-three/fiber
   * holds.
   */
  reactStrictMode: false,
};

export default nextConfig;
