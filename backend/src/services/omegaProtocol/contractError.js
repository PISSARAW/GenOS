'use strict';

class OmegaProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OmegaProtocolError';
    this.code = code;
  }
}

module.exports = { OmegaProtocolError };
