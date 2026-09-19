'use strict';

function C({ id, label, domain, school, status, service = null, serviceMaturity = null }) {
  return { id, label, domain, school, status, service, ...(serviceMaturity ? { serviceMaturity } : {}) };
}

module.exports = { C };
