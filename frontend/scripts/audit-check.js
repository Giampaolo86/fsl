#!/usr/bin/env node
/* Audit dipendenze frontend: fallisce su high/critical salvo eccezioni documentate in audit-allowlist.json (solo pacchetti di build senza patch disponibile). */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const allow = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "audit-allowlist.json"), "utf8"));
const res = spawnSync("yarn", ["audit", "--json", "--level", "high"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const advisories = res.stdout.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((d) => d && d.type === "auditAdvisory").map((d) => d.data.advisory);
const blocking = [];
const allowed = [];
for (const a of advisories) {
  if (!["high", "critical"].includes(a.severity)) continue;
  const paths = a.findings.flatMap((f) => f.paths || []);
  const rule = allow.exceptions.find((e) => e.module === a.module_name && (!e.path_prefix || paths.every((p) => e.path_prefix.some((pre) => p.startsWith(pre)))));
  (rule ? allowed : blocking).push({ module: a.module_name, severity: a.severity, title: a.title, patched: a.patched_versions, paths: paths.slice(0, 2), reason: rule && rule.reason });
}
const uniq = (arr) => Array.from(new Map(arr.map((x) => [x.module + x.title, x])).values());
for (const x of uniq(allowed)) console.log(`ALLOWED  ${x.severity.padEnd(8)} ${x.module} — ${x.reason}`);
for (const x of uniq(blocking)) console.log(`BLOCKING ${x.severity.padEnd(8)} ${x.module} (${x.title}) patched: ${x.patched} via ${x.paths.join(" | ")}`);
console.log(`\n${uniq(blocking).length} bloccanti, ${uniq(allowed).length} eccezioni documentate`);
process.exit(uniq(blocking).length ? 1 : 0);
