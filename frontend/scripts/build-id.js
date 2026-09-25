// Genera un identificativo di build usato per rilevare versioni vecchie in memoria (PWA) e ricaricare in silenzio
const fs = require("fs");
const path = require("path");
const id = `${Date.now().toString(36)}`;
fs.writeFileSync(path.join(__dirname, "..", "public", "version.json"), JSON.stringify({ build: id }));
fs.writeFileSync(path.join(__dirname, "..", "src", "build-id.js"), `export const BUILD_ID = "${id}";\n`);
console.log("FSL build id:", id);
