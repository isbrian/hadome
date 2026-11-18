'use strict';

// 試験枠への自動探索を避け、明示的に指定されたタブだけを受け入れる。
const TEST_PORT = 8799;

function acceptsRoster(port) {
  return Number(port) !== TEST_PORT;
}

function acceptsHello(port, message) {
  return Number(port) !== TEST_PORT || !!(message && message.pinnedPort === TEST_PORT);
}

module.exports = { TEST_PORT, acceptsRoster, acceptsHello };
