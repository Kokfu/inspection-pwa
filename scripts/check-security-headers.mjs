#!/usr/bin/env node
// Security-header regression check for the reverse proxy (I-08).
//
//   node scripts/check-security-headers.mjs                     static + live (https://localhost)
//   node scripts/check-security-headers.mjs --static-only       Caddyfile text only (no network)
//   node scripts/check-security-headers.mjs --url https://host  live check against another origin
//   node scripts/check-security-headers.mjs --allow-report-only  accept a Report-Only CSP (rollout soak only)
//
// Playwright runs against the Vite dev server, not Caddy, so it cannot see these headers.
// Live mode accepts Caddy's internal CA on localhost only (rejectUnauthorized is relaxed for
// localhost / 127.0.0.1 / ::1 and never for any other host).
import { readFileSync } from "node:fs";
import https from "node:https";
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const baseUrl = new URL(option("--url", "https://localhost"));
// The CSP must be enforced unless --allow-report-only is passed (used only during a rollout soak).
const requireEnforced = !flag("--allow-report-only");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const caddyfilePath = path.join(root, "infra", "reverse-proxy", "Caddyfile");
const isLocalHost = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(baseUrl.hostname);

let failures = 0;
const fail = (label, detail) => { failures += 1; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ""}`); };
const pass = (label) => console.log(`  ok    ${label}`);
const check = (label, condition, detail) => (condition ? pass(label) : fail(label, detail));

// ---------------------------------------------------------------- static check
console.log(`\nStatic: ${path.relative(root, caddyfilePath)}`);
const caddyfile = readFileSync(caddyfilePath, "utf8");
const uncommented = caddyfile.split(/\r?\n/).filter((line) => !line.trim().startsWith("#")).join("\n");
for (const name of [
  "Strict-Transport-Security",
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy"
]) {
  check(`Caddyfile sets ${name}`, new RegExp(`^\\s*(?:[\\w@]+\\s+)?"?${name}"?\\s`, "mi").test(uncommented) || uncommented.includes(name));
}
check("Caddyfile never uses HSTS preload", !/preload/i.test(uncommented.match(/Strict-Transport-Security[^\n]*/i)?.[0] ?? ""));
check("Caddyfile HSTS is not unconditional (host matcher present)", /@\S+\s+not\s+host\s+localhost/.test(uncommented) && /header\s+@\S+\s+Strict-Transport-Security/.test(uncommented));
check("Caddyfile keeps the sw.js/HTML revalidation rule", /Cache-Control\s+"no-cache"/.test(uncommented));
check("Caddyfile keeps immutable hashed-asset caching", /max-age=31536000, immutable/.test(uncommented));
check("Caddyfile has no wildcard CORS", !/Access-Control-Allow-Origin/i.test(uncommented));
check("Caddyfile hard-codes no production host/IP", !/\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(uncommented) || /127\.0\.0\.1/.test(uncommented));

if (flag("--static-only")) finish();

// ----------------------------------------------------------------- live check
function request(pathname, { method = "GET" } = {}) {
  const url = new URL(pathname, baseUrl);
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(url, { method, rejectUnauthorized: !isLocalHost, headers: { "accept-encoding": "identity" } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.setTimeout(8000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

const directive = (policy, name) => {
  const part = policy.split(";").map((item) => item.trim()).find((item) => item.toLowerCase().startsWith(`${name} `) || item.toLowerCase() === name);
  return part ? part.slice(name.length).trim().split(/\s+/).filter(Boolean) : undefined;
};

function assertCommon(label, response) {
  const h = response.headers;
  check(`${label}: X-Content-Type-Options nosniff`, h["x-content-type-options"] === "nosniff", String(h["x-content-type-options"]));
  check(`${label}: X-Frame-Options DENY`, (h["x-frame-options"] ?? "").toUpperCase() === "DENY", String(h["x-frame-options"]));
  check(`${label}: Referrer-Policy strict-origin-when-cross-origin or stricter`,
    ["strict-origin-when-cross-origin", "strict-origin", "same-origin", "no-referrer"].includes(h["referrer-policy"]), String(h["referrer-policy"]));
  const permissions = h["permissions-policy"] ?? "";
  check(`${label}: Permissions-Policy allows camera for self only`, /camera=\(self\)/.test(permissions), permissions);
  check(`${label}: Permissions-Policy allows same-origin sensors (camera path, I-20)`, /accelerometer=\(self\)/.test(permissions) && /gyroscope=\(self\)/.test(permissions), permissions);
  check(`${label}: Permissions-Policy denies geolocation and microphone`, /geolocation=\(\)/.test(permissions) && /microphone=\(\)/.test(permissions), permissions);
  const enforced = h["content-security-policy"];
  const reportOnly = h["content-security-policy-report-only"];
  const policy = enforced ?? reportOnly;
  check(`${label}: Content-Security-Policy present (${enforced ? "enforced" : reportOnly ? "report-only" : "missing"})`, Boolean(policy));
  if (requireEnforced) check(`${label}: CSP is enforced, not report-only`, Boolean(enforced));
  if (policy) {
    check(`${label}: CSP default-src 'self'`, directive(policy, "default-src")?.join(" ") === "'self'", policy);
    const script = directive(policy, "script-src") ?? directive(policy, "default-src") ?? [];
    check(`${label}: CSP script-src has no unsafe-inline/unsafe-eval`, !script.some((token) => /unsafe-(inline|eval)/.test(token)), script.join(" "));
    check(`${label}: CSP object-src 'none'`, directive(policy, "object-src")?.join(" ") === "'none'");
    check(`${label}: CSP base-uri 'self'`, directive(policy, "base-uri")?.join(" ") === "'self'");
    check(`${label}: CSP frame-ancestors 'none'`, directive(policy, "frame-ancestors")?.join(" ") === "'none'");
    const img = directive(policy, "img-src") ?? [];
    check(`${label}: CSP img-src allows 'self' blob: data:`, ["'self'", "blob:", "data:"].every((token) => img.includes(token)), img.join(" "));
    check(`${label}: CSP connect-src 'self'`, directive(policy, "connect-src")?.join(" ") === "'self'");
    check(`${label}: CSP worker-src/manifest-src 'self'`, directive(policy, "worker-src")?.join(" ") === "'self'" && directive(policy, "manifest-src")?.join(" ") === "'self'");
  }
  check(`${label}: no Access-Control-Allow-Origin added`, h["access-control-allow-origin"] === undefined);
  check(`${label}: Server header hidden`, h.server === undefined, String(h.server));
  const hsts = h["strict-transport-security"];
  if (isLocalHost) {
    check(`${label}: no HSTS on localhost`, hsts === undefined, String(hsts));
  } else {
    const maxAge = Number(/max-age=(\d+)/i.exec(hsts ?? "")?.[1] ?? 0);
    check(`${label}: HSTS max-age >= 300 on a real host`, maxAge >= 300, String(hsts));
    check(`${label}: HSTS has no preload`, !/preload/i.test(hsts ?? ""));
  }
}

console.log(`\nLive: ${baseUrl.origin}`);
const index = await request("/");
check("/ returns 200", index.status === 200, String(index.status));
check("/ keeps Cache-Control no-cache", /no-cache/.test(index.headers["cache-control"] ?? ""), String(index.headers["cache-control"]));
assertCommon("/", index);

const sw = await request("/sw.js");
check("/sw.js returns 200", sw.status === 200, String(sw.status));
check("/sw.js stays revalidated (Cache-Control no-cache)", /no-cache/.test(sw.headers["cache-control"] ?? ""), String(sw.headers["cache-control"]));
assertCommon("/sw.js", sw);

const manifest = await request("/manifest.webmanifest");
check("/manifest.webmanifest returns 200", manifest.status === 200, String(manifest.status));
assertCommon("/manifest.webmanifest", manifest);

const assetPath = /\/assets\/[^"']+\.js/.exec(index.body)?.[0];
check("index.html references a hashed /assets/*.js", Boolean(assetPath));
if (assetPath) {
  const asset = await request(assetPath);
  check(`${assetPath} returns 200`, asset.status === 200, String(asset.status));
  check(`${assetPath} stays immutable-cached`, /immutable/.test(asset.headers["cache-control"] ?? ""), String(asset.headers["cache-control"]));
  assertCommon("hashed asset", asset);
}

const missing = await request("/assets/does-not-exist.js");
check("missing hashed asset is still a 404", missing.status === 404, String(missing.status));
assertCommon("missing asset (404)", missing);

const health = await request("/api/health");
check("/api/health returns 200 with status ok", health.status === 200 && /"status":"ok"/.test(health.body), String(health.status));
assertCommon("/api/health", health);

finish();

function finish() {
  console.log(failures === 0 ? "\nAll security-header checks passed." : `\n${failures} security-header check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}
