const REQUIRED_CLI_FIELDS = {
  genos_snapshot: ['agent', 'out'],
  genos_capsule_create: ['snapshot_id'],
  genos_merge: ['branch_id'],
  genos_audit: ['snapshot_id'],
  genos_biomimicry: ['feature', 'action']
};

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateRelativePath(field, value) {
  if (!nonEmptyString(value) || value.includes('\0') || /^[\\/]|^[A-Za-z]:[\\/]/.test(value)) {
    return `${field} must be a non-empty workspace-relative path.`;
  }
  if (value.split(/[\\/]/).includes('..')) return `${field} must not contain parent path segments.`;
  return null;
}

function validateReplayArgs(args) {
  if (!nonEmptyString(args.snapshot) && !nonEmptyString(args.snapshot_id)) return 'snapshot or snapshot_id must be provided.';
  return null;
}

function validateRequiredFields(toolName, args) {
  for (const field of REQUIRED_CLI_FIELDS[toolName] || []) {
    if (!nonEmptyString(args[field])) return `${field} must be a non-empty string.`;
  }
  return null;
}

function validatePathFields(args) {
  for (const field of ['agent', 'out', 'snapshot', 'snapshot_id', 'branch_id', 'parent_id', 'output']) {
    if (args[field] !== undefined) {
      const error = validateRelativePath(field, args[field]);
      if (error) return error;
    }
  }
  return null;
}

export function validateCliArguments(toolName, args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return 'Tool arguments must be a JSON object.';
  const requiredError = toolName === 'genos_replay'
    ? validateReplayArgs(args)
    : validateRequiredFields(toolName, args);
  if (requiredError) return requiredError;
  return validatePathFields(args);
}
