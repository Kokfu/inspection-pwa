import type { RequestHandler } from "express";

/** Browser writes must be same-origin, including sibling subdomains (same-site). */
export const requestSecurity: RequestHandler = (request, response, next) => {
  response.setHeader("Cache-Control", "private, no-store");
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) { next(); return; }
  const site = request.header("sec-fetch-site");
  const origin = request.header("origin");
  let allowed = !site || site === "same-origin" || site === "none";
  if (origin) {
    try {
      const parsed = new URL(origin);
      // Published browser access is HTTPS, including when TLS terminates before
      // the API. Never infer that external scheme from forwarding headers or
      // the internal HTTP socket. Secure session cookies use the same policy.
      allowed &&= parsed.protocol === "https:" && parsed.host === request.header("host") && parsed.origin === origin;
    } catch { allowed = false; }
  }
  if (!allowed) { response.status(403).json({ error: "CROSS_ORIGIN_WRITE_DENIED" }); return; }
  next();
};
