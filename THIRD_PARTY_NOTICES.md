# Third-party notices

No third-party 3D models, textures, images or fonts are used. The fish geometry, shaders, bubbles and dust are
procedurally generated in this repository's own code.

Runtime / build dependencies (installed from npm):

- **three** — MIT License — https://github.com/mrdoob/three.js
- **@mediapipe/tasks-vision** — Apache License 2.0 — https://github.com/google-ai-edge/mediapipe (includes the WASM runtime copied to `public/mediapipe/wasm` by `scripts/setup.mjs`)
- **vite** — MIT License — https://github.com/vitejs/vite

Downloaded at install/run time (not bundled in this source archive):

- **hand_landmarker.task** (MediaPipe Hand Landmarker model, float16) — Apache License 2.0 — fetched from
  `storage.googleapis.com/mediapipe-models/...` into `public/models/` (or loaded from that URL at runtime).

Techniques used (Catmull-Rom splines, instanced meshes, rotation-minimizing frames, the One-Euro filter by
Casiez, Roussel & Vogel, 2012) are standard published methods implemented from scratch here; no third-party source
code was copied.
