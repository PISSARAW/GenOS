'use strict';

class AllostasisProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AllostasisProtocolError';
    this.code = code;
  }
}

module.exports = { AllostasisProtocolError };
