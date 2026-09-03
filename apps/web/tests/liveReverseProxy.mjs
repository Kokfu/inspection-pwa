import http from "node:http";

const webOrigin = new URL(process.env.LIVE_WEB_ORIGIN ?? "http://127.0.0.1:4175");
const apiOrigin = new URL(process.env.LIVE_API_ORIGIN ?? "http://127.0.0.1:4180");
const port = Number(process.env.LIVE_PROXY_PORT ?? "4176");

http.createServer((request, response) => {
  const api = request.url?.startsWith("/api/") ?? false;
  const origin = api ? apiOrigin : webOrigin;
  const targetPath = api ? (request.url ?? "/").slice(4) || "/" : request.url ?? "/";
  const upstream = http.request({ protocol: origin.protocol, hostname: origin.hostname, port: origin.port, method: request.method, path: targetPath, headers: { ...request.headers, host: origin.host } }, (upstreamResponse) => { response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers); upstreamResponse.pipe(response); });
  upstream.on("error", () => { if (!response.headersSent) response.writeHead(502, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "LIVE_PROXY_UPSTREAM_UNAVAILABLE" })); });
  request.pipe(upstream);
}).listen(port, "127.0.0.1", () => console.log(`live reverse proxy listening on ${port}`));
