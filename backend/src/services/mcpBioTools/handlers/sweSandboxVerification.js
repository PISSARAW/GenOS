const { defaultSweSandboxVerification } = require('../../sweSandboxVerificationService');

async function handleSweSandboxVerification(args) {
  const action = args.action || 'verify';

  if (action === 'syntax' || action === 'py_compile') {
    const code = args.code || args.content || '';
    const res = defaultSweSandboxVerification.verifyPythonSyntax(code, args.filename || 'sandbox_test.py');
    return {
      configured: true,
      success: res.syntaxValid,
      status: res.syntaxValid ? 'completed' : 'tool_error',
      transport: 'local_service',
      output: JSON.stringify(res, null, 2)
    };
  }

  // Action par défaut : évaluation globale avec Checkpoint p53 et Cervelet
  const patchStr = args.patch || args.diff || '';
  const res = defaultSweSandboxVerification.evaluatePatchExecution(patchStr, {
    targetFile: args.target_file || args.targetFile,
    expectedPass: args.expected_pass !== false,
    observedFail: Boolean(args.observed_fail)
  });

  return {
    configured: true,
    success: res.success,
    status: res.success ? 'completed' : 'tool_error',
    transport: 'local_service',
    output: JSON.stringify(res, null, 2)
  };
}

function handleSweSandboxVerificationError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'local_service',
    output: e.message || String(e)
  };
}

module.exports = {
  handleSweSandboxVerification,
  handleSweSandboxVerificationError
};
