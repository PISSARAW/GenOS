'use strict';

function intersectAuthority(requiredAuthority, projectAuthority) {
  const required = [...new Set(requiredAuthority || [])].sort();
  const granted = new Set(projectAuthority || []);
  const allowed = required.filter((permission) => granted.has(permission));
  const denied = required.filter((permission) => !granted.has(permission));
  return { allowed, denied, authorized: denied.length === 0 };
}

module.exports = { intersectAuthority };
