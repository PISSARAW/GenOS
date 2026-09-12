const { defaultSweFaultLocalizer } = require('../../sweFaultLocalizerService');

async function handleSweFaultLocalizer(args) {
  const problemStatement = args.problem_statement || args.problemStatement || args.issue || '';
  const repoName = args.repo || args.repo_name || 'django';
  const topK = Number(args.top_k || args.topK || 3);

  const res = defaultSweFaultLocalizer.localizeFault(problemStatement, repoName, topK);

  return {
    configured: true,
    success: true,
    status: 'completed',
    transport: 'local_service',
    output: JSON.stringify(res, null, 2)
  };
}

function handleSweFaultLocalizerError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'local_service',
    output: e.message || String(e)
  };
}

module.exports = {
  handleSweFaultLocalizer,
  handleSweFaultLocalizerError
};
