'use strict';

class SynapseProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SynapseProtocolError';
    this.code = code;
  }
}

module.exports = { SynapseProtocolError };
