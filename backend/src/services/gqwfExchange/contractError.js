'use strict';

class GqwfExchangeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GqwfExchangeError';
    this.code = code;
  }
}

module.exports = { GqwfExchangeError };
