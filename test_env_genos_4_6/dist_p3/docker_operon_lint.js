"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// docker_operon_lint.ts - outil de l'opéron Docker (règles type hadolint simplifiées).
const node_fs_1 = require("node:fs");
const lines = (0, node_fs_1.readFileSync)('Dockerfile', 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#'));
const diagnostics = [];
let sawFrom = false;
let sawWorkdir = false;
let sawUserNode = false;
lines.forEach((line, idx) => {
    const instr = line.split(/\s+/)[0].toUpperCase();
    if (!sawFrom && instr !== 'FROM' && instr !== 'ARG') {
        diagnostics.push(`ligne ${idx + 1}: ${instr} avant FROM (interdit)`);
    }
    if (instr === 'FROM') {
        sawFrom = true;
    }
    if (instr === 'WORKDIR') {
        sawWorkdir = true;
    }
    if ((instr === 'COPY' || instr === 'ADD') && !sawWorkdir && sawFrom) {
        diagnostics.push(`ligne ${idx + 1}: COPY/ADD sans WORKDIR préalable`);
    }
    if (instr === 'USER' && /node/i.test(line)) {
        sawUserNode = true;
    }
    if (sawUserNode && instr === 'USER' && /root/i.test(line)) {
        diagnostics.push(`ligne ${idx + 1}: repasse en root après USER node`);
    }
});
if (!lines.some((l) => l.toUpperCase().startsWith('HEALTHCHECK'))) {
    diagnostics.push('pas de HEALTHCHECK');
}
if (diagnostics.length === 0) {
    console.log('DOCKER LINT: OK (FROM premier, WORKDIR avant COPY, USER node, HEALTHCHECK présent)');
}
else {
    console.log(`DOCKER LINT: ${diagnostics.length} problème(s)`);
    diagnostics.forEach((d) => console.log(`  - ${d}`));
    process.exitCode = 1;
}
