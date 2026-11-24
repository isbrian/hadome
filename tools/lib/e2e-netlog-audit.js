'use strict';

// NetLog の事後検証。通信を遮断する機能ではない。
function auditNetLog(log, allowedDestinations) {
  if (!log?.constants?.logEventTypes || !Array.isArray(log.events) || !log.events.length) {
    throw new Error('Missing or incomplete Chromium NetLog');
  }
  const names = new Map(Object.entries(log.constants.logEventTypes).map(([name, id]) => [id, name]));
  const allowed = new Set(allowedDestinations);
  const destinations = new Set();
  const violations = [];
  const sources = new Set();
  for (const event of log.events) {
    const type = names.get(event.type);
    if (!['TCP_CONNECT', 'TCP_CONNECT_ATTEMPT', 'UDP_CONNECT', 'SOCKET_CONNECT', 'QUIC_SESSION'].includes(type)) continue;
    const p = event.params || {};
    const addresses = [...(Array.isArray(p.address_list) ? p.address_list : []), p.address, p.remote_address, p.peer_address].filter(value => typeof value === 'string' && value.length > 0);
    for (const address of new Set(addresses)) {
      destinations.add(address);
      if (!allowed.has(address)) {
        sources.add(event.source?.id);
        violations.push({ type, address, sourceId: event.source?.id ?? null });
      }
    }
  }
  if (!destinations.size) throw new Error('NetLog contains no auditable socket destinations');
  const transfers = log.events.filter(event => sources.has(event.source?.id) && ['UDP_BYTES_SENT', 'UDP_BYTES_RECEIVED', 'SOCKET_BYTES_SENT', 'SOCKET_BYTES_RECEIVED'].includes(names.get(event.type))).map(event => ({ sourceId: event.source.id, type: names.get(event.type), bytes: event.params?.byte_count ?? null }));
  return { passed: violations.length === 0, eventCount: log.events.length, destinations: [...destinations], violations, transfers };
}

module.exports = { auditNetLog };
