// Copy non-TS assets that tsc doesn't emit into dist/. Currently just the
// canvas stylesheet, which Canvas.tsx imports as a side effect — consumers
// (the shell, Vite pkgs) follow that import to bundle the CSS, so the file
// must sit next to the compiled Canvas.js.
import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const assets = [['src/canvas/canvas.css', 'dist/canvas/canvas.css']];

for (const [from, to] of assets) {
  await cp(join(root, from), join(root, to));
  console.log(`copied ${from} → ${to}`);
}
