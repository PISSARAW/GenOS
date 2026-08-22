const vscode = require('vscode');
const contract = require('../genos-extension-contract.json');
function activate(context) {
  const base = vscode.workspace.getConfiguration('genos').get('apiBase', 'http://localhost:4000/api');
  const run = async (id) => {
    const response = await fetch(`${base}/ide/commands/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: vscode.workspace.name }) });
    if (!response.ok) throw new Error(`GenOS API returned ${response.status}`);
    vscode.window.showInformationMessage(`GenOS command accepted: ${id}`);
  };
  context.subscriptions.push(vscode.commands.registerCommand('genos.generateCompliance', () => run('compliance.generate')));
  context.subscriptions.push(vscode.commands.registerCommand('genos.openWorkspace', () => run('workspace.open')));
  return contract;
}
module.exports = { activate };
