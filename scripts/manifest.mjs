// Writes custom-elements.json from src/*.manifest.js
import { readdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const files = (await readdir(new URL("src/", root)))
  .filter((file) => file.endsWith(".manifest.js"))
  .sort();

const modules = [];
for (const file of files) {
  const path = "src/" + file.replace(".manifest.js", ".js");
  const loaded = (await import(new URL("src/" + file, root))).default;
  const declarations = [].concat(loaded);
  const exports = declarations.flatMap(({ name, tagName }) => [
    { kind: "js", name, declaration: { name, module: path } },
    {
      kind: "custom-element-definition",
      name: tagName,
      declaration: { name, module: path },
    },
  ]);
  modules.push({ kind: "javascript-module", path, declarations, exports });
}

const manifest = { schemaVersion: "2.1.0", readme: "README.md", modules };
await writeFile(
  new URL("custom-elements.json", root),
  JSON.stringify(manifest, null, 2) + "\n"
);
console.log(`custom-elements.json: ${modules.length} modules`);
