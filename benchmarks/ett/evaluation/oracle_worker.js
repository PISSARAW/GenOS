'use strict';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const checks = JSON.parse(input);
  const results = checks.map(({ expected, proposal }) => {
    const validEvidence = expected.requireInspection
      ? Array.isArray(proposal?.evidenceRefs)
        && proposal.evidenceRefs.includes(`candidate:${proposal.answerId}:inspection`)
      : Array.isArray(proposal?.evidenceRefs) && proposal.evidenceRefs.length > 0;
    const valid = proposal && proposal.answerId === expected.answerId && validEvidence;
    return { verdict: valid ? 'supported' : 'refuted', usefulDiscoveries: valid ? 1 : 0 };
  });
  process.stdout.write(JSON.stringify(results));
});
