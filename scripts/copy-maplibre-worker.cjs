// Copies the MapLibre GL worker bundle into public/vendor so the 3D scene can
// load it from a plain URL. Webpack cannot bundle MapLibre's module worker, so
// SceneExplorer points `setWorkerUrl` at these files instead.
const { copyFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const source = join(__dirname, "..", "node_modules", "maplibre-gl", "dist");
const target = join(__dirname, "..", "public", "vendor");
mkdirSync(target, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(source, file), join(target, file));
}
console.log("maplibre worker copied to public/vendor");
