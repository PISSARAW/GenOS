const { defaultSweSurgicalRepair } = require('../../sweSurgicalRepairService');

async function handleSweSurgicalRepair(args) {
  const action = args.action || 'synthesize';
  const filePath = args.file_path || args.filePath || args.target_file || 'module.py';

  if (action === 'validate' || action === 'validate_boundary') {
    const patchStr = args.patch || args.diff || '';
    const res = defaultSweSurgicalRepair.validateExcisionBoundary(patchStr);
    return {
      configured: true,
      success: res.acceptableForPromotion,
      status: res.acceptableForPromotion ? 'completed' : 'tool_error',
      transport: 'local_service',
      output: JSON.stringify(res, null, 2)
    };
  }

  // Action par défaut : synthèse de patch chirurgical
  const original = args.original_chunk || args.originalChunk || args.original || '';
  const replacement = args.replacement_chunk || args.replacementChunk || args.replacement || '';
  const startLine = args.start_line || args.startLine || 1;

  const res = defaultSweSurgicalRepair.synthesizeSurgicalDiff(filePath, original, {
    replacementChunk: replacement,
    startLine
  });

  return {
    configured: true,
    success: res.success,
    status: 'completed',
    transport: 'local_service',
    output: JSON.stringify(res, null, 2)
  };
}

function handleSweSurgicalRepairError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'local_service',
    output: e.message || String(e)
  };
}

module.exports = {
  handleSweSurgicalRepair,
  handleSweSurgicalRepairError
};
