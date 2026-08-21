const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'test_e2e_api_client.mjs');
const part2Path = path.join(__dirname, 'test_e2e_api_client_part2.mjs');

const lines = fs.readFileSync(filePath, 'utf-8').split('\n');

// Find where Section 9 starts
const sec9Index = lines.findIndex(l => l.includes('// Section 9: Incidents'));
// Find where Section 16 ends (before Summary)
const summaryIndex = lines.findIndex(l => l.includes('// Summary'));

const part1 = lines.slice(0, sec9Index);
const part2 = lines.slice(sec9Index, summaryIndex);
const part3 = lines.slice(summaryIndex);

const newPart2Content = `import http from 'http';

export async function runPart2(api, apiRequest, assert, MILITARY_OVERRIDE_TOKEN, useToastStore) {
${part2.join('\n')}
}
`;

fs.writeFileSync(part2Path, newPart2Content);

// Inject import after other imports
const importIndex = lines.findIndex(l => l.includes('const require = '));
part1.splice(importIndex, 0, `import { runPart2 } from './test_e2e_api_client_part2.mjs';`);

const finalPart1Content = [
  ...part1,
  `  await runPart2(api, apiRequest, assert, MILITARY_OVERRIDE_TOKEN, useToastStore);`,
  ...part3
].join('\n');

fs.writeFileSync(filePath, finalPart1Content);
console.log('Split successful');
