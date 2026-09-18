'use strict';

function C({ id, label, domain, school, status, service = null }) {
  return { id, label, domain, school, status, service };
}

module.exports = { C };
