# Equilibrium

A hand-controlled 3D fish school that swims through a real-time water surface on top of your live webcam.

## dev/creator = tubakhxn

## What is this project about?

Hand Fish turns your webcam into an interactive underwater scene. Point your index finger and a large school of 300 colorful, individually modelled fish builds up and swims along a smooth 3D curve that follows your fingertip. The camera image is drawn through a live water surface, so your fingertip and every fish leave ripples and wakes. Everything runs in the browser.

- **Point** (index finger out): the school builds and follows your fingertip, and the water ripples where you touch it.
- **Pinch** (thumb + index): the school compresses, then expands again when you release.
- **Open palm** (held for a moment): the school slows, gathers, and dissolves into glowing dust, with big ripples spreading from your palm.
- **Relax your hand**: the school re-forms.
- **No hand**: the school swims a slow idle loop.

Built with Three.js (instanced fish, GPU water simulation) and MediaPipe Hand Landmarker for hand tracking.

## How to fork and run

1. Click **Fork** at the top right of the repository page on GitHub to copy it to your account.
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-username>/gesture-fish.git
   cd gesture-fish
   ```
3. Install and run:
   ```bash
   npm install
   npm run dev
   ```
4. Open the printed `localhost` URL and allow camera access.
5. Create a branch for your changes, commit, push to your fork, and open a Pull Request if you want to share them back:
   ```bash
   git checkout -b my-change
   git add .
   git commit -m "my change"
   git push origin my-change
   ```

Production build: `npm run build`.

If the hand model cannot be downloaded during install, put `hand_landmarker.task` in `public/models/` (see `THIRD_PARTY_NOTICES.md`), or the app will load it from Google's CDN at runtime.

No camera? The mouse works as the fingertip: hold click for pinch, hold Space for open palm. Press R to toggle the water effect and D for a debug overlay.

## Learn more (Wikipedia)

- [Three.js](https://en.wikipedia.org/wiki/Three.js)
- [WebGL](https://en.wikipedia.org/wiki/WebGL)
- [MediaPipe](https://en.wikipedia.org/wiki/MediaPipe)
- [Gesture recognition](https://en.wikipedia.org/wiki/Gesture_recognition)
- [Computer vision](https://en.wikipedia.org/wiki/Computer_vision)
- [Shoaling and schooling](https://en.wikipedia.org/wiki/Shoaling_and_schooling)
- [Geometry instancing](https://en.wikipedia.org/wiki/Geometry_instancing)
- [Centripetal Catmull–Rom spline](https://en.wikipedia.org/wiki/Centripetal_Catmull%E2%80%93Rom_spline)
- [Wave equation](https://en.wikipedia.org/wiki/Wave_equation)
- [Refraction](https://en.wikipedia.org/wiki/Refraction)
- [Finite-state machine](https://en.wikipedia.org/wiki/Finite-state_machine)
- [Vite](https://en.wikipedia.org/wiki/Vite_(software))

## dev/creator = tubakhxn
