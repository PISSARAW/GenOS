const fs = require('fs');
const path = require('path');

function checkChromatinLock(agentId, toolName) {
  if (!agentId || !toolName) return null;
  const safeAgentId = path.basename(String(agentId).replace(/[^\w.-]/g, '_'));
  if (!safeAgentId) return null;
  const repositoryRoot = path.resolve(__dirname, '../../..');
  const workspaceRoot = process.env.GENOS_WORKSPACE_ROOT || repositoryRoot;
  const candidateDirs = [
    ...(process.env.GENOS_STUDIO_ROOT ? [path.join(process.env.GENOS_STUDIO_ROOT, 'chromatin')] : []),
    ...(process.env.GENOS_ROOT ? [path.join(process.env.GENOS_ROOT, 'chromatin')] : []),
    path.join(workspaceRoot, '.genos-matrix', 'chromatin'),
    path.join(workspaceRoot, '.genos', 'chromatin'),
    path.join(process.cwd(), '.genos-matrix', 'chromatin'),
    path.join(process.cwd(), '.genos', 'chromatin')
  ];
  let chromatinData = null;
  for (const dir of candidateDirs) {
    const filePath = path.join(dir, `${safeAgentId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        chromatinData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (chromatinData) break;
      } catch (_) {}
    }
  }
  if (!chromatinData) return null;
  const genes = chromatinData.genes || {};
  const normalizedTool = String(toolName).toLowerCase().trim();
  for (const [locus, gene] of Object.entries(genes)) {
    const normLocus = String(locus).toLowerCase().trim();
    const isMatch = normLocus === normalizedTool ||
      normLocus.replace(/^genos_/, '') === normalizedTool.replace(/^genos_/, '');
    if (isMatch) {
      const isLocked = gene.developmentally_locked === true ||
        (gene.chromatin_state && String(gene.chromatin_state).toLowerCase() !== 'euchromatin');
      if (isLocked) {
        return {
          locked: true, locus, chromatinState: gene.chromatin_state,
          developmentallyLocked: gene.developmentally_locked,
          reason: 'Tool locked in heterochromatin'
        };
      }
    }
  }
  return null;
}
module.exports = { checkChromatinLock };
