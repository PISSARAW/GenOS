'use strict';

function mainValue1(__genosValueScope1) {
  return __genosValueScope1.before.relationType === 'partner' && __genosValueScope1.profile.relationType === 'friend'
      && __genosValueScope1.profile.disclosureLevel === 0.15 && __genosValueScope1.profile.authority === 0.5;
}

module.exports = { mainValue1 };
