// Headers the phone dev proxy sends to Caddy. Caddy sees Host "localhost"; the API (requestSecurity) refuses a write
// whose Origin host differs from Host, so a browser Origin such as http://localhost:8081 is rewritten to match (I-43).
const FORWARD_HOST = 'localhost';

function forwardHeaders(incoming) {
  const headers = { ...incoming, host: FORWARD_HOST };
  if (headers.origin) headers.origin = `http://${FORWARD_HOST}`;
  return headers;
}
module.exports = { forwardHeaders };
