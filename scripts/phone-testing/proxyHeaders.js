// Headers the phone dev proxy sends to Caddy. Caddy sees Host "localhost"; the API (requestSecurity) refuses a write
// whose Origin host differs from Host or whose Origin is not https (published browser access is HTTPS), so a browser Origin such as
// http://localhost:8081 is rewritten to https://localhost, matching Host (I-43, corrected for the https-only check).
const FORWARD_HOST = 'localhost';

function forwardHeaders(incoming) {
  const headers = { ...incoming, host: FORWARD_HOST };
  if (headers.origin) headers.origin = `https://${FORWARD_HOST}`;
  return headers;
}
module.exports = { forwardHeaders };
