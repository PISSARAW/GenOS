'use strict';

function main(context) {
  return context.before.relationType === 'partner' && context.profile.relationType === 'friend'
      && context.profile.disclosureLevel === 0.15 && context.profile.authority === 0.5;
}

module.exports = { main };
