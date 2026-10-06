// dev/creator=tubakhxn
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dst = path.join(root, 'public', 'mediapipe', 'wasm');

try {
  if (fs.existsSync(src)) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dst, f));
    console.log('[setup] MediaPipe wasm copied');
  } else console.log('[setup] tasks-vision not installed yet, skipping wasm copy');
} catch (e) { console.log('[setup] wasm copy skipped:', e.message); }

const modelDir = path.join(root, 'public', 'models');
const modelPath = path.join(modelDir, 'hand_landmarker.task');
const URL_ = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
if (!fs.existsSync(modelPath)) {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(URL_, { signal: ctl.signal });
    clearTimeout(to);
    if (r.ok) {
      fs.mkdirSync(modelDir, { recursive: true });
      fs.writeFileSync(modelPath, Buffer.from(await r.arrayBuffer()));
      console.log('[setup] hand model downloaded');
    } else console.log('[setup] model download HTTP', r.status, '- will use CDN at runtime');
  } catch (e) { console.log('[setup] model download skipped (' + e.message + ') - will use CDN at runtime'); }
}
process.exit(0);
