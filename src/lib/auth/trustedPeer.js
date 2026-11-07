// x-mr-real-ip is only trustworthy when custom-server.js stamped it from the TCP socket.
// It proves that by echoing the per-process secret it generated at boot, which a client
// cannot guess. Without the proof the header is just attacker-supplied input.
export function hasTrustedPeerHeaders(request) {
  const token = process.env.MARS_ROUTER_PEER_TOKEN || process.env.NINEROUTER_PEER_TOKEN;
  const presented = request.headers.get("x-mr-peer-token") || request.headers.get("x-9r-peer-token");
  return Boolean(token) && presented === token;
}
