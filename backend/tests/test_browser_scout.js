/**
 * Test Suite — Browser Scout Service & MCP Handler
 * Vérifie l'actuation sémantique web (AXTree), l'interaction avec des formulaires complexes
 * et l'interception automatique de téléchargements d'artefacts.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { BrowserScoutService, defaultBrowserScout } = require('../src/services/browserScoutService');
const { handleBrowserScout } = require('../src/services/mcpBioTools/handlers/browserScout');

async function runTests() {
  console.log('====================================================');
  console.log('       GenOS V3 - Test Browser Scout Service        ');
  console.log('====================================================');

  const testDownloadDir = path.resolve(__dirname, '../scratch/test_downloads');
  const scout = new BrowserScoutService({ downloadDir: testDownloadDir });

  // Mock HTML simulant un portail de recherche complexe (type USGS / GitHub)
  const mockHtml = `
    <!DOCTYPE html>
    <html>
      <head><title>USGS Nonindigenous Aquatic Species Search</title></head>
      <body>
        <h1>Aquatic Species Database</h1>
        <form action="/search" method="GET">
          <input type="text" name="specie_query" placeholder="Enter species name (e.g. Clownfish)" id="specie_input" />
          <select name="state_select" id="state_select">
            <option value="AL">Alabama</option>
            <option value="FL" selected>Florida</option>
            <option value="CA">California</option>
          </select>
          <button type="submit" id="search_btn">Search Records</button>
        </form>
        <a href="/data/occurrences_report_2023.csv" id="dl_csv">Download Full CSV Dataset</a>
        <table id="results_table">
          <tr><th>ID</th><th>Location</th><th>Zipcode</th></tr>
          <tr><td>4029</td><td>Fred Howard Park</td><td>34689</td></tr>
        </table>
      </body>
    </html>
  `;

  // 1. Test Navigation & AXTree Parsing
  console.log('[1/5] Testing navigation and AXTree generation...');
  const navRes = await scout.navigate('test_session_1', 'https://nas.er.usgs.gov/queries', {
    htmlContent: mockHtml
  });

  assert.strictEqual(navRes.success, true);
  assert.strictEqual(navRes.title, 'USGS Nonindigenous Aquatic Species Search');
  assert.ok(navRes.interactiveNodesCount >= 4, 'Should extract at least 4 interactive nodes');

  const inputNode = scout.getSession('test_session_1').axTree.find(n => n.role === 'textbox');
  assert.ok(inputNode, 'Must identify textbox');
  assert.strictEqual(inputNode.selectorId, '@input:specie_input');

  const selectNode = scout.getSession('test_session_1').axTree.find(n => n.role === 'combobox');
  assert.ok(selectNode, 'Must identify combobox');
  assert.strictEqual(selectNode.options.length, 3);
  console.log('  -> AXTree parsed successfully with structured roles');

  // 2. Test Form Filling & Option Selection
  console.log('[2/5] Testing fill and select_option actions...');
  const fillRes = await scout.act('test_session_1', {
    type: 'fill',
    selectorId: '@input:specie_input',
    value: 'Amphiprion ocellaris'
  });
  assert.strictEqual(fillRes.success, true);
  assert.strictEqual(fillRes.updatedValue, 'Amphiprion ocellaris');

  const selectRes = await scout.act('test_session_1', {
    type: 'select_option',
    selectorId: '@select:state_select',
    value: 'FL'
  });
  assert.strictEqual(selectRes.success, true);
  console.log('  -> Form state updated correctly');

  // 3. Test Form Submission
  console.log('[3/5] Testing form submission...');
  const submitRes = await scout.act('test_session_1', {
    type: 'submit'
  });
  assert.strictEqual(submitRes.success, true);
  assert.ok(submitRes.resultUrl.includes('specie_query=Amphiprion+ocellaris'));
  assert.ok(submitRes.resultUrl.includes('state_select=FL'));
  console.log('  -> Query string correctly computed:', submitRes.resultUrl);

  // 4. Test Automatic Download Interception
  console.log('[4/5] Testing downloadable file interception (.csv / .pdf)...');
  const linkNode = scout.getSession('test_session_1').axTree.find(n => n.role === 'link' && n.isDownload);
  assert.ok(linkNode, 'Must detect downloadable link');

  const dlRes = await scout.act('test_session_1', {
    type: 'click',
    selectorId: linkNode.selectorId
  });

  assert.strictEqual(dlRes.success, true);
  assert.strictEqual(dlRes.action, 'download');
  assert.ok(dlRes.download.sha256, 'Must generate SHA-256 hash');
  assert.ok(fs.existsSync(dlRes.download.localPath), 'File must be written on disk');
  console.log('  -> Download intercepted to:', dlRes.download.localPath);
  console.log('  -> SHA-256:', dlRes.download.sha256);

  // 5. Test MCP Handler
  console.log('[5/5] Testing MCP Handler genos_browser_act...');
  const mcpNav = await handleBrowserScout({
    action: 'navigate',
    session_id: 'mcp_session',
    url: 'https://test.internal',
    html: mockHtml
  });
  assert.strictEqual(mcpNav.success, true);
  assert.strictEqual(mcpNav.status, 'completed');

  const mcpAct = await handleBrowserScout({
    action: 'act',
    session_id: 'mcp_session',
    type: 'fill',
    selector_id: '@input:specie_input',
    value: 'Clownfish'
  });
  assert.strictEqual(mcpAct.success, true);

  const mcpSnap = await handleBrowserScout({
    action: 'snapshot',
    session_id: 'mcp_session'
  });
  assert.strictEqual(mcpSnap.success, true);
  console.log('  -> MCP integration passed');

  // Nettoyage
  try {
    fs.rmSync(testDownloadDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n[PASS] All Browser Scout tests passed successfully!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('[FATAL] Browser Scout test failed:', err);
  process.exit(1);
});
