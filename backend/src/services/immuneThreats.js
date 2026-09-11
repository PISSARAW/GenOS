/**
 * GenOS Immune Threat Signatures (N6)
 * Hardened detection patterns:
 * - PATH_TRAVERSAL fires on a SINGLE `../` (or `..\`), not two.
 * - COMMAND_INJECTION also matches `$(...)`, backticks and `${...}`
 *   anywhere, plus `rm -rf`, `mkfs`, `chmod -R` and `curl ... | sh`
 *   without any prefix requirement.
 * - PROMPT_INJECTION adds FR+EN jailbreak patrons (whole words,
 *   case-insensitive) without touching the legitimate-use threshold
 *   (scanThreats only reports names; blocking stays with the callers).
 */

const THREAT_SIGNATURES = [
  { name: 'SQL_INJECTION', pattern: /\bunion\s+select\b|\bor\s+1\s*=\s*1\b|;\s*drop\s+table\b/i },
  {
    name: 'COMMAND_INJECTION',
    pattern: /\$\(|`|\$\{|\brm\s+-rf?\b|\bmkfs\b|\bchmod\s+-[a-z]*R[a-z]*\b|\bcurl\b[^\n]*\|\s*sh\b|(?:;|&&|\|\|)\s*(?:rm|del|curl|wget|powershell|cmd)\b/i
  },
  { name: 'PATH_TRAVERSAL', pattern: /\.\.[\\/]/ },
  {
    name: 'PROMPT_INJECTION',
    pattern: /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions|ignore\s+les|system\s+prompt|\bjailbreak\b|\bdan\b|\bbypass\b|d[eé]sactive|\boublie\b/i
  }
];

function signatureNames() {
  return THREAT_SIGNATURES.map((signature) => signature.name);
}

function scanThreats(target) {
  const content = String(target || '');
  const found = [];
  for (const signature of THREAT_SIGNATURES) {
    if (signature.pattern.test(content)) found.push(signature.name);
  }
  return { threats: found };
}

module.exports = {
  THREAT_SIGNATURES,
  signatureNames,
  scanThreats
};
