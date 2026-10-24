'use strict';
const assert = require('node:assert/strict');
const { run, repairPrompt, failureFeedback, locatorRepairHint, repairPlan,
  applyRepairPlan } = require('../src/services/workerCodeTestRepair');
const { throwIfFailed } = require('../src/services/workerEvidenceBarrierLocalTestFailure');
const { fromModelResult } = require('../src/services/workerEvidenceBarrierLocalSchemaFailure');
const { summarizeFailedPatches } = require('../src/services/workerCodeTestRepairTelemetry');
const mission = { localCodeWorker: true, prompt: 'Build the pantry app.', timeoutMs: 10000,
  executionBudget: { latencyMs: 10000, tokens: 20000 } };
const failed = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: {
  tests: [{ command: 'npm test', exitCode: 1, stderr: 'missing Category label' }],
  failedPatchContents: [{ path: 'index.html', content: '<h1>Existing Pantry</h1>' }]
}, usage: { inputTokens: 1200, outputTokens: 800, tokens: 2000 } });
assert.throws(() => throwIfFailed({ testStatus: 'failed', tests: [] },
	{ inputTokens: 1200, outputTokens: 800 }, 2000), (error) => {
	assert.equal(error.code, 'WORKER_TESTS_FAILED');
	assert.equal(error.usage.tokens, 2000);
	return true;
});
(async () => {
  const schemaFailure = fromModelResult({ schemaViolation: {
    error: 'Model output did not satisfy the requested worker evidence schema.',
    violations: ['/patches must contain at least 1 valid item(s)']
  }, text: '{"patches":[]}', inputTokens: 100, outputTokens: 50 });
  assert.equal(schemaFailure.code, 'WORKER_OUTPUT_SCHEMA_VIOLATION');
  assert.equal(schemaFailure.usage.tokens, 150);
  const schemaPrompts = [];
  const schemaRepair = await run({ mission, runAttempt: async (attemptMission) => {
    schemaPrompts.push(attemptMission);
    if (schemaPrompts.length === 1) throw schemaFailure;
    return 'schema repaired';
  } });
  assert.equal(schemaRepair, 'schema repaired');
  assert.equal(schemaPrompts[1].executionBudget.tokens, 19850);
  assert.match(schemaPrompts[1].prompt, /WORKER_OUTPUT_SCHEMA_VIOLATION/);
  assert.match(schemaPrompts[1].prompt, /at least 1 valid item/);
  assert.match(schemaPrompts[1].prompt, /\{"patches":\[\]\}/);
  const anchorPrompts = []; const anchorRepair = await run({ mission, runAttempt: async (attemptMission) => { anchorPrompts.push(attemptMission); if (anchorPrompts.length === 1) throw Object.assign(new Error("Exact edit anchor must occur once in 'src/index.js'."), { code: 'WORKER_OUTPUT_SCHEMA_VIOLATION', workerArtifactDiagnostics: { error: "Exact edit anchor must occur once in 'src/index.js'." }, usage: { tokens: 50 } }); return 'full replacement accepted'; } });
  assert.equal(anchorRepair, 'full replacement accepted');
  assert.equal(anchorPrompts[1].forceFullFileReplacement, true, 'ambiguous anchors force full replacement');
  const prompts = [];
  let retries = 0;
  const result = await run({ mission, onRetry: () => { retries += 1; },
    runAttempt: async (attemptMission) => {
      prompts.push(attemptMission.prompt);
      if (prompts.length === 2) assert.equal(attemptMission.executionBudget.tokens, 18000);
      if (prompts.length === 1) throw failed;
      return 'passed';
    } });
  assert.equal(result, 'passed');
  assert.equal(retries, 1);
  assert.match(prompts[1], /remains as the uncommitted base in the isolated workspace/i);
  assert.match(repairPrompt({ mission, error: failed, attempt: 1 }), /Repair attempt 1 of 25/);
  assert.match(prompts[1], /missing Category label/);
  assert.match(prompts[1], /Existing Pantry/);
  assert.match(repairPrompt({ mission, error: failed, attempt: 1 }), /npm test/);
  assert.match(failureFeedback(failed), /Exit code: 1/);
  const categoryFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stderr: 'locator.selectOption: Timeout 4000ms exceeded. waiting for getByLabel(/^category$/i)'
  }] }, usage: { inputTokens: 25, outputTokens: 25, tokens: 50 } });
  assert.ok(locatorRepairHint(categoryFailure).includes('<label for="category">Category</label>'));
  assert.match(failureFeedback(categoryFailure), /label that control Filter category/);
  assert.ok(failureFeedback(categoryFailure).indexOf('exact accessible Category control')
    < failureFeedback(categoryFailure).indexOf('locator.selectOption'));
  const plan = repairPlan(categoryFailure);
  assert.deepEqual(plan, { kind: 'ensure_accessible_select_label', label: 'Category' });
  const buttonFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stderr: "locator.click: waiting for getByRole('button', { name: /increase quantity for oats/i })"
  }] }, usage: { tokens: 50 } });
  const buttonPlan = repairPlan(buttonFailure);
  assert.deepEqual(buttonPlan, { kind: 'ensure_quantity_increment_behavior', label: 'Increase quantity for Oats' });
  assert.match(locatorRepairHint(buttonFailure), /aria-label="Increase quantity for Oats"/);
  const filterFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stderr: 'locator.selectOption: waiting for getByLabel(/filter category/i)'
  }] }, usage: { tokens: 50 } });
  const filterPlan = repairPlan(filterFailure);
  assert.deepEqual(filterPlan, { kind: 'ensure_filter_select_label', label: 'Filter category' });
  assert.match(locatorRepairHint(filterFailure), /aria-label="Filter category"/);
  const filterOptionFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stderr: 'did not find some options for getByLabel(/filter category/i)'
  }] }, usage: { tokens: 50 } });
  assert.match(locatorRepairHint(filterOptionFailure), /Add a visible <option value="Food">Food<\/option>/);
  const searchFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stderr: 'locator.fill: waiting for getByLabel(/search/i)'
  }] }, usage: { tokens: 50 } });
  const searchPlan = repairPlan(searchFailure);
  assert.deepEqual(searchPlan, { kind: 'ensure_search_input_label', label: 'Search' });
  const bestBeforeFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stderr: 'locator.fill: waiting for getByLabel(/best.before/i)'
  }] }, usage: { tokens: 50 } });
  const bestBeforePlan = repairPlan(bestBeforeFailure);
  assert.deepEqual(bestBeforePlan, { kind: 'ensure_best_before_input_label', label: 'Best-before date' });
  const missingItemNameFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1, stderr: 'locator.fill: waiting for getByLabel(/item name/i) at acceptance.cjs:15:14'
  }] }, usage: { tokens: 50 } });
  const itemNameInputPlan = repairPlan(missingItemNameFailure);
  assert.deepEqual(itemNameInputPlan, { kind: 'ensure_item_name_input_label', label: 'Item name' });
  assert.match(locatorRepairHint(missingItemNameFailure), /do not use Search as its accessible name/);
  const mislabeledItemName = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<label for="item-name">Item name:</label><input id="item-name" type="text" aria-label="Search"><label for="search">Search</label><input id="search" type="search">'
  }] });
  const repairedItemName = JSON.parse(applyRepairPlan(mislabeledItemName, itemNameInputPlan)).patches[0].content;
  assert.match(repairedItemName, /<input id="item-name" type="text" aria-label="Item name">/);
  assert.match(repairedItemName, /<input id="search" type="search">/);
  const duplicateItemNameIds = '<form><label for="itemName">Item name:</label><input id="itemName" value="${item.name}" readonly aria-label="Item name"><input id="itemName" type="text" required></form>'; const repairedDuplicateItemNameIds = JSON.parse(applyRepairPlan(JSON.stringify({ patches: [{ path: 'index.html', content: duplicateItemNameIds }] }), itemNameInputPlan)).patches[0].content; assert.match(repairedDuplicateItemNameIds, /<input value="\$\{item\.name\}" readonly>/); assert.match(repairedDuplicateItemNameIds, /<label for="itemName">Item name:<\/label>/); assert.match(repairedDuplicateItemNameIds, /<input id="itemName" type="text" required aria-label="Item name">/);
  const proposalText = JSON.stringify({ format: 'genos.file-replacement/v1', patches: [{
    path: 'index.html', content: '<form><select id="category"><option value="Food">Food</option></select><button>+</button><button>Delete Oats</button></form><select id="filter"><option>All</option></select><input id="search" placeholder="Search items">'
  }], tests: ['npm test'], evidence: 'test fixture' });
  const repairedText = applyRepairPlan(proposalText, [plan, buttonPlan, filterPlan, searchPlan]);
  const repairedContent = JSON.parse(repairedText).patches[0].content;
  assert.match(repairedContent,
    /<select id="category" aria-label="Category">/);
  const singleCategoryProposal = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<select id="category"><option value="Food">Food</option></select>'
  }] });
  const singleCategoryRepair = JSON.parse(applyRepairPlan(singleCategoryProposal, plan)).patches[0].content;
  assert.match(singleCategoryRepair, /<select id="category" aria-label="Category">/); assert.match(singleCategoryRepair, /<select id="filterCategory" aria-label="Filter category"><option value="all">All<\/option><option value="Food">Food<\/option><\/select>/);
  const duplicateCategoryLabel = JSON.parse(applyRepairPlan(JSON.stringify({ patches: [{ path: 'index.html', content: '<form><label for="category" aria-label="Category">Category</label><select id="category"><option value="Food">Food</option></select></form>' }] }), plan)).patches[0].content; assert.match(duplicateCategoryLabel, /<label for="category">Category<\/label><select id="category" aria-label="Category">/);
  const placeholderQuantityAction = JSON.parse(applyRepairPlan(JSON.stringify({ patches: [{ path: 'index.html', content: '<input id="quantity" aria-label="Quantity"><button aria-label="Increase quantity for Name">+</button>' }] }), itemNameInputPlan)).patches[0].content;
  assert.doesNotMatch(placeholderQuantityAction, /Increase quantity for Name/i);
  assert.match(repairedContent, /<button aria-label="Increase quantity for Oats">\+/);
  const itemNameButton = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<button onclick="increaseQuantity(\'${item.itemName}\')">Increase</button>'
  }] });
  assert.match(JSON.parse(applyRepairPlan(itemNameButton, buttonPlan)).patches[0].content,
    /aria-label="Increase quantity for \$\{item\.itemName\}"/);
  assert.match(repairedContent, /<button>Delete Oats<\/button>/);
  assert.match(repairedContent, /<select id="filter" aria-label="Filter category"><option>All<\/option><option value="Food">Food<\/option>/);
  assert.match(repairedContent, /<input id="search" placeholder="Search items" aria-label="Search">/);
  const bestBeforeProposal = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<label for="best_before">Best-before date:</label><input type="date" id="best_before">'
  }] });
  assert.match(JSON.parse(applyRepairPlan(bestBeforeProposal, bestBeforePlan)).patches[0].content,
    /<input type="date" id="best_before" aria-label="Best-before date">/);
  const missingBestBefore = JSON.parse(applyRepairPlan(JSON.stringify({ patches: [{
    path: 'index.html', content: '<form><label for="itemName">Item name</label><input id="itemName"><button type="submit">Add Item</button></form>'
  }] }), bestBeforePlan)).patches[0].content;
  assert.match(missingBestBefore, /<label for="bestBeforeDate">Best-before date<\/label><input id="bestBeforeDate" name="bestBeforeDate" type="date" aria-label="Best-before date">/);
  const selfClosingDates = '<input id="best-before" type="date"/><input type="date" id="expiry">';
  const repairedSelfClosingDates = JSON.parse(applyRepairPlan(JSON.stringify({ patches: [{
    path: 'index.html', content: selfClosingDates
  }] }), bestBeforePlan)).patches[0].content;
  assert.ok(/<input id="best-before" type="date" aria-label="Best-before date" \/>/.test(repairedSelfClosingDates)
    && /<input type="date" id="expiry" aria-label="Best-before date">/.test(repairedSelfClosingDates));
  const searchFilterFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stderr: 'AssertionError: 0 !== 1 at tests/acceptance.cjs:22:10'
  }] }, usage: { tokens: 50 } });
  const searchFilterPlan = repairPlan(searchFilterFailure);
  assert.deepEqual(searchFilterPlan, { kind: 'ensure_search_filter_behavior', label: 'Search' });
  assert.ok(locatorRepairHint(searchFilterFailure).includes('case-insensitive substring of item.name')); const validationFeedbackFailure = Object.assign(new Error('test failed'), { proposal: { tests: [{ stderr: 'AssertionError [ERR_ASSERTION]: show validation feedback at tests/acceptance.cjs:34:10' }] } }); assert.match(locatorRepairHint(validationFeedbackFailure), /visible error message in an aria-live region or role=alert/);
  const searchFilterProposal = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<input id="filter-search"><select id="filter-category"></select><script>function renderItems(items) { const box = document.getElementById(\'items\'); box.innerHTML = \'\'; items.forEach(item => { box.append(item.name); }); }</script>'
  }] });
  const searchFilterContent = JSON.parse(applyRepairPlan(searchFilterProposal, searchFilterPlan)).patches[0].content;
  assert.match(searchFilterContent, /getElementById\("filter-search"\s*\)/);
  assert.match(searchFilterContent, /getElementById\("filter-category"\s*\)/);
  assert.match(searchFilterContent, /filteredItems\.forEach\(item/);
  assert.match(searchFilterContent, /item\.category === categoryFilter/);
  const persistencePlan = { kind: 'ensure_local_storage_mutations', label: 'pantryItems' };
  const persistenceProposal = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<script>let pantryItems = []; function addItem() { pantryItems.push(item); } function increaseQuantity(index) { pantryItems[index].quantity += 1; } function deleteItem(index) { pantryItems.splice(index, 1); } window.onload = () => { pantryItems.push(...JSON.parse(localStorage.getItem(\'pantryItems\') || \'[]\')); };</script>'
  }] });
  const persistenceContent = JSON.parse(applyRepairPlan(persistenceProposal, persistencePlan)).patches[0].content;
  assert.equal(Array.from(persistenceContent.matchAll(/localStorage\.setItem\("pantryItems"/g)).length, 3);
  assert.equal(applyRepairPlan(repairedText, plan), repairedText);
  const categoryOnlyContent = JSON.parse(applyRepairPlan(proposalText, plan)).patches[0].content;
  assert.match(categoryOnlyContent, /<select id="category" aria-label="Category">/);
  assert.match(categoryOnlyContent, /<select id="filter" aria-label="Filter category">/);
  const dynamicButtonProposal = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<button id="oats-increase" aria-label="Increase quantity for Oats">Increase quantity</button>'
    + '<script>row.innerHTML = `<button id="${itemName}-increase">Increase</button>`;</script>'
  }] });
  const dynamicButtonContent = JSON.parse(applyRepairPlan(dynamicButtonProposal, buttonPlan)).patches[0].content;
  assert.doesNotMatch(dynamicButtonContent.match(/<button id="oats-increase"[^>]*>/)[0], /quantity/i);
  assert.match(dynamicButtonContent, /<button id="\$\{itemName\}-increase" aria-label="Increase quantity for \$\{itemName\}">/);
  const generatedActionProposal = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<script>pantryItems.forEach((item, index) => { const increaseBtn = document.createElement(\'button\'); increaseBtn.textContent = \'Increase quantity\'; increaseBtn.onclick = () => increaseQuantity(index); });</script>'
  }] });
  const generatedActionContent = JSON.parse(applyRepairPlan(generatedActionProposal, buttonPlan)).patches[0].content;
  assert.match(generatedActionContent, /increaseBtn\.setAttribute\('aria-label', `Increase quantity for \$\{item\.name\}`\);/);
  assert.match(generatedActionContent, /increaseBtn\.textContent = 'Increase quantity';/);
  const templateActionProposal = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<script>function renderItems() { items.forEach((item, index) => { row.innerHTML = `<button onclick="increaseQuantity(${index})">Increase quantity</button>`; }); }</script>'
  }] });
  const templateActionContent = JSON.parse(applyRepairPlan(templateActionProposal, buttonPlan)).patches[0].content;
  assert.match(templateActionContent, /<button onclick="increaseQuantity\(\$\{index\}\)" aria-label="Increase quantity for Oats">/);
  let repairPlanAttempts = 0;
  await run({ mission, runAttempt: async (attemptMission) => {
    repairPlanAttempts += 1;
    if (repairPlanAttempts === 1) throw categoryFailure;
    if (repairPlanAttempts === 2) throw buttonFailure;
    if (repairPlanAttempts === 3) throw filterFailure;
    if (repairPlanAttempts === 4) throw searchFailure;
    assert.deepEqual(attemptMission.codeRepairPlans, [plan, buttonPlan, filterPlan, searchPlan]);
    return 'repaired';
  } });
  assert.equal(repairPlanAttempts, 5);
  const oatsFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stdout: 'CANDIDATE index.html true 5000',
    stderr: 'AssertionError: 0 !== 1 at tests/acceptance.cjs:19:10'
  }] }, usage: { tokens: 50 } });
  assert.match(locatorRepairHint(oatsFailure), /append the form values to the shared items collection/);
  assert.match(failureFeedback(oatsFailure), /append the form values to the shared items collection/);
  const addPlan = repairPlan(oatsFailure);
  assert.deepEqual(addPlan, { kind: 'ensure_add_item_behavior', label: 'Add Item' });
  const addCandidate = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<form><input id="itemName"><input id="quantity" type="number"><select id="category"><option>Food</option></select><input id="bestBefore" type="date"></form><script>let pantry=[];function renderPantry(){}</script></body>'
  }] });
  const repairedAdd = JSON.parse(applyRepairPlan(addCandidate, addPlan)).patches[0].content;
  assert.match(repairedAdd, /genosAddItemRepair/);
  assert.match(repairedAdd, /stopImmediatePropagation/);
  assert.match(repairedAdd, /const item=\{name,itemName:name,ItemName:name,quantity,category,Category:category/);
  assert.doesNotMatch(repairedAdd, /if\(typeof addItem==='function'\)/);
  assert.match(repairedAdd, /const cleanForm=form\.cloneNode\(true\)/);
  assert.match(repairedAdd, /form\.replaceWith\(cleanForm\)/);
  assert.match(repairedAdd, /cleanForm\.querySelectorAll\('button,input\[type="submit"\],input\[type="image"\]'\)/);
  assert.match(repairedAdd, /button\[onclick\*="addItem"\]/);
  assert.match(repairedAdd, /#addItem,#add-item/);
  assert.match(repairedAdd, /find\(button=>\/\^add item\$\/i\.test\(button\.textContent\.trim\(\)\)\)/);
  assert.match(repairedAdd, /localStorage\.setItem/);
  assert.match(repairedAdd, /renderPantry\(\)/);
  const clickAddCandidate = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<input id="itemName"><input id="itemQuantity" type="number"><input id="bestBeforeDate" type="date"><select id="category"></select><button id="addItem">Add Item</button><script>let pantryData={items:[]};function renderPantry(){}</script>'
  }] });
  const repairedClickAdd = JSON.parse(applyRepairPlan(clickAddCandidate, addPlan)).patches[0].content;
  assert.match(repairedClickAdd, /const cleanTarget=target\.cloneNode\(true\)/);
  assert.match(repairedClickAdd, /target\.replaceWith\(cleanTarget\)/);
  assert.ok(repairedClickAdd.includes("target.addEventListener(target===form?'submit':'click'"));
  assert.match(repairedClickAdd, /pantryData\.items\.push\(item\)/);
  assert.match(repairedClickAdd, /JSON\.stringify\(pantryData\)/);
  const restoredPantry = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<form><input id="item-name"><input id="quantity" type="number"><input id="best-before-date" type="date"><select id="category"></select></form><script>const pantryState = JSON.parse(localStorage.getItem(\'pantryState\')) || [];function renderPantry(){}</script>'
  }] });
  const repairedRestoredPantry = JSON.parse(applyRepairPlan(restoredPantry, addPlan)).patches[0].content;
  assert.match(repairedRestoredPantry, /pantryState\.push\(item\)/);
  assert.match(repairedRestoredPantry, /JSON\.stringify\(pantryState\)/);
  const domPantryCandidate = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<form><input id="itemName"><input id="quantity" type="number"><select id="category"></select><input id="bestBefore" type="date"></form><table><tbody id="pantry"></tbody></table><script>const pantry=document.querySelector("#pantry tbody");function increaseQuantity(){}function deleteItem(){}</script>'
  }] });
  const repairedDomPantry = JSON.parse(applyRepairPlan(domPantryCandidate, addPlan)).patches[0].content;
  assert.match(repairedDomPantry, /container\.appendChild\(row\)/);
  assert.match(repairedDomPantry, /localStorage\.setItem\("pantry",JSON\.stringify\(items\)\)/);
  const nestedStateCandidate = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<form id="pantryForm"><input id="itemName"><input id="quantity"><button type="submit">Add Item</button></form><table><tbody id="pantry-items"></tbody></table><script>document.querySelector("#pantryForm").addEventListener("submit",function(event){const state=JSON.parse(localStorage.getItem("state")||"[]");state.push({itemName:"Oats"});updatePantryTable(state);});function updatePantryTable(items){document.getElementById("pantry-items").innerHTML="";}</script>'
  }] });
  const repairedNestedState = JSON.parse(applyRepairPlan(nestedStateCandidate, addPlan)).patches[0].content;
  assert.match(repairedNestedState, /localStorage\.getItem\("state"\)/);
  assert.match(repairedNestedState, /items\.push\(item\)/);
  assert.match(repairedNestedState, /updatePantryTable\(items\)/);
  const callbackPantryCandidate = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<form><input id="itemName"><input id="quantity" type="number"><input id="bestBefore" type="date"><select id="category"></select><button type="submit">Add Item</button></form><table id="pantry"><tbody></tbody></table><script>window.addEventListener("load",function(){const pantry=JSON.parse(localStorage.getItem("pantry"))||[];const table=document.querySelector("#pantry tbody");pantry.forEach(item=>{const row=document.createElement("tr");table.appendChild(row);});});</script>'
  }] });
  const callbackPantryContent = JSON.parse(applyRepairPlan(callbackPantryCandidate, addPlan)).patches[0].content;
  const callbackRepair = callbackPantryContent.split('function genosAddItemRepair')[1].split('},true)')[0];
  assert.doesNotMatch(callbackRepair, /pantry\.push\(item\)/);
  assert.match(callbackRepair, /const container=document\.querySelector\("#pantry tbody"\)/);
  assert.match(callbackRepair, /container\.appendChild\(row\)/);
  assert.match(callbackRepair, /localStorage\.setItem\("pantry",JSON\.stringify\(items\)\)/);
  assert.match(callbackRepair, /data-action="increase"/);
  const duplicateFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stderr: 'AssertionError: 2 !== 1 at tests/acceptance.cjs:19:10'
  }] }, usage: { tokens: 50 } });
  assert.ok(locatorRepairHint(duplicateFailure).includes('2 visible text matches for Oats'));
  const duplicateAccessibleName = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{ stderr: 'getByLabel(/item name/i) resolved to 2 elements' }] } }); const duplicateAccessibleMarkup = JSON.stringify({ patches: [{ path: 'index.html', content: '<label for="item-name">Item Name:</label><input id="item-name"><label for="search-input" aria-label="Search Item Name:">Search Item Name:</label><input id="search-input" aria-label="Search Item Name:">' }] }); const repairedAccessibleMarkup = JSON.parse(applyRepairPlan(duplicateAccessibleMarkup, repairPlan(duplicateAccessibleName))).patches[0].content; assert.match(repairedAccessibleMarkup, /<label for="search-input">Search<\/label><input id="search-input" aria-label="Search">/); assert.match(repairedAccessibleMarkup, /<input id="item-name">/);
  const persistenceFailure = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stderr: 'AssertionError: updated quantity persists at tests/acceptance.cjs:26:10'
  }] }, usage: { tokens: 50 } });
  assert.match(locatorRepairHint(persistenceFailure), /Save the canonical inventory array to localStorage immediately/);
  assert.match(locatorRepairHint(persistenceFailure), /after every add, quantity increment, and delete/);
  assert.deepEqual(repairPlan(persistenceFailure),
    { kind: 'ensure_quantity_increment_behavior', label: 'Increase quantity for Oats' });
  const incrementFailure = Object.assign(new Error('test failed'), { proposal: { tests: [{ stderr: 'assert.ok(await page.getByText(/Oats.*3|3.*Oats/i).count()) at tests/acceptance.cjs:24:10' }] } });
  const incrementPlan = repairPlan(incrementFailure);
  assert.deepEqual(incrementPlan, { kind: 'ensure_quantity_increment_behavior', label: 'Increase quantity for Oats' });
  const incrementCandidate = JSON.stringify({ patches: [{ path: "index.html", content: "<table><tbody><tr><td>Oats</td><td>2</td></tr></tbody></table><script>const pantry=JSON.parse(localStorage.getItem(\'pantry\'))||[];</script></body>" }] });
  const repairedIncrement = JSON.parse(applyRepairPlan(incrementCandidate, incrementPlan)).patches[0].content;
  assert.match(repairedIncrement, /genosQuantityIncrementRepair/);
  assert.match(repairedIncrement, /item\.quantity=\(Number\(quantityCell\?\.value\?\?quantityCell\?\.textContent\)\|\|Number\(item\.quantity\)\|\|combined\)\+1/);
  assert.match(repairedIncrement, /if\(!item\)\{item=\{name,itemName:name,ItemName:name,category:/);
  assert.match(repairedIncrement, /items\.push\(item\)/);
  assert.match(repairedIncrement, /quantityCell\.textContent=String\(item\.quantity\)/);
  const exportFailure = Object.assign(new Error('test failed'), { proposal: { tests: [{
    stderr: "page.waitForEvent('download'): Timeout 4000ms exceeded while waiting for event \"download\" at tests/acceptance.cjs:28:44"
  }] } });
  assert.match(locatorRepairHint(exportFailure), /real browser download/);
  assert.match(locatorRepairHint(exportFailure), /filename ending in \.json/);
  const exportPlan = repairPlan(exportFailure);
  assert.deepEqual(exportPlan, { kind: 'ensure_json_export', label: 'Export JSON' });
  const ambiguousExport = Object.assign(new Error('test failed'), { proposal: { tests: [{ stderr: "strict mode violation: getByRole('button', { name: /export json|export csv/i }) resolved to 2 elements at acceptance.cjs:28:82" }] } }); assert.deepEqual(repairPlan(ambiguousExport), exportPlan);
  const exportProposal = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<button>Export JSON</button><script>const pantryItems = [];</script>'
  }] });
  const repairedExport = JSON.parse(applyRepairPlan(exportProposal, exportPlan)).patches[0].content;
  assert.match(repairedExport, /function exportPantryJSON\(\)/);
  assert.match(repairedExport, /link\.download='pantry\.json'/);
  const scopedExport = require('../src/services/workerCodeExportRepair').ensureJsonExport(
    '<button onclick="exportPantryJSON()">Export JSON</button><script>window.addEventListener("load",()=>{const pantry=[];localStorage.getItem("pantry-state");function exportPantryJSON(){throw new Error("scoped state");}});</script>'
  );
  assert.match(scopedExport, /genosJsonExportRepair/);
  assert.match(scopedExport, /localStorage\.getItem\("pantry-state"\)/);
  assert.match(scopedExport, /stopImmediatePropagation/);
  assert.match(scopedExport, /link\.download='pantry\.json'/);
  const quantityCollision = Object.assign(new Error('test failed'), { code: 'WORKER_TESTS_FAILED', proposal: { tests: [{
    command: 'npm test', exitCode: 1,
    stderr: 'getByLabel(/quantity/i) resolved to 2 elements: aria-label="Increase quantity for [object HTMLInputElement]"'
  }] }, usage: { tokens: 50 } });
  const quantityPlan = repairPlan(quantityCollision);
  assert.deepEqual(quantityPlan, { kind: 'ensure_quantity_action_label', label: 'Increase quantity for Oats' });
  const quantityReloadError = Object.assign(new Error('test failed'), { proposal: { tests: [{ stderr:
    'Error: strict mode violation: getByLabel(/quantity/i) resolved to 2 elements. Call log: waiting for getByLabel(/quantity/i) at tests/acceptance.cjs:31:38'
  }] } });
  const quantityReloadPlan = repairPlan(quantityReloadError);
  assert.deepEqual(quantityReloadPlan, { kind: 'ensure_quantity_field_after_reload', label: 'Quantity' });
  const quantityReloadProposal = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<button aria-label="Increase quantity for Oats">Increase quantity</button>'
  }] });
  const quantityReloadContent = JSON.parse(applyRepairPlan(quantityReloadProposal, quantityReloadPlan)).patches[0].content;
  assert.match(quantityReloadContent, /aria-label="Increase quantity for Oats"/); assert.match(quantityReloadContent, /genosQuantityIncrementRepair/);
  const quantityRowProposal = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<form><input type="number" aria-label="Quantity"></form><div><input type="number" aria-label="Quantity for Oats"><button aria-label="Increase quantity for Oats">Increase</button><button aria-label="Decrease quantity for Oats">Decrease</button></div>'
  }] });
  const quantityRowContent = JSON.parse(applyRepairPlan(quantityRowProposal, quantityReloadPlan)).patches[0].content;
  assert.match(quantityRowContent, /<input type="number" aria-label="Quantity">/);
  assert.match(quantityRowContent, /aria-label="Item count"/);
  assert.match(quantityRowContent, /aria-label="Increase quantity for Oats"/);
  assert.match(quantityRowContent, /genosQuantityLabelRepair/);
  assert.match(quantityRowContent, /button\.setAttribute\('aria-label',\"Increase quantity for Oats\"\)/); assert.match(quantityRowContent, /'Decrease Oats':'Increase Oats'/);
  const missingQuantity = { proposal: { tests: [{ stderr: 'waiting for getByLabel(/quantity/i) at tests/acceptance.cjs:15:38 Timeout 4000ms exceeded' }] } };
  const missingQuantityOutput = JSON.parse(applyRepairPlan(JSON.stringify({ patches: [{ path: 'index.html', content: '<form><label for="qty">Quantity</label><input id="qty" type="number"></form>' }] }), repairPlan(missingQuantity))).patches[0].content;
  assert.match(missingQuantityOutput, /<input id="qty" type="number" aria-label="Quantity">/);
  const quantityHint = locatorRepairHint(quantityCollision);
  assert.ok(/using the item name string/.test(quantityHint) && /only inside the rendered item row after Add Item/.test(quantityHint));
  const quantityProposal = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<input type="number" aria-label="Increase quantity for Oats"><button onclick="increaseQuantity()">+</button><button id="increaseButton" aria-label="Increase quantity for Oats"></button><button data-testid="addOatsButton" onclick="addItem(\'Oats\', 2)">Add Oats</button>'
  }] });
  const repairedQuantity = JSON.parse(applyRepairPlan(quantityProposal, quantityPlan)).patches[0].content;
  assert.doesNotMatch(repairedQuantity, /<input[^>]*aria-label="Increase quantity for Oats"/);
  assert.match(repairedQuantity, /<button(?=[^>]*aria-label="Increase quantity for Oats")(?=[^>]*onclick="increaseQuantity\(\)")[^>]*>/);
  assert.doesNotMatch(repairedQuantity, /increaseButton|addOatsButton/);
  const itemNameFailure = Object.assign(new Error('test failed'), { proposal: { tests: [{
    stderr: 'getByLabel(/item name/i) resolved to 2 elements'
  }] } });
  const itemNamePlan = repairPlan(itemNameFailure);
  const itemNameProposal = JSON.stringify({ patches: [{ path: 'index.html', content: '<input aria-label="Item name"><td aria-label="Item name">Oats</td>' }] });
  assert.match(JSON.parse(applyRepairPlan(itemNameProposal, itemNamePlan)).patches[0].content,
    /<td>Oats<\/td>/);
  const duplicateItemName = JSON.stringify({ patches: [{ path: 'index.html', content:
    '<label for="item-name" aria-label="Item name">Item name:</label><input id="item-name" aria-label="Item name">'
  }] });
  const repairedDuplicateItemName = JSON.parse(applyRepairPlan(duplicateItemName, itemNamePlan)).patches[0].content;
  assert.match(repairedDuplicateItemName, /<label for="item-name">Item name:<\/label>/);
  assert.match(repairedDuplicateItemName, /<input id="item-name" aria-label="Item name">/);
  assert.deepEqual(repairPlan({ proposal: { tests: [{ stderr: '2 !== 1 at acceptance.cjs:19:10' }],
    failedPatchContents: [{ path: 'index.html', content: '<td aria-label="Item name">Oats</td>' }] } }), itemNamePlan);
  const patchDiagnostics = summarizeFailedPatches({ proposal: { failedPatchContents: [{
    path: 'index.html', content: '<form><label>Item</label><input id="name"></form><div role="button">+</div><script>function handleAddItem(event) { renderItem(item); } function addItem(event) { const item = readForm(); items.push(item); } form.addEventListener("submit", addItem);</script>'
  }] } });
  assert.equal(patchDiagnostics[0].path, 'index.html');
  assert.ok(patchDiagnostics[0].controls.some((item) => item.includes('<input id="name">')));
  assert.ok(patchDiagnostics[0].roles.some((item) => item.includes('role="button"')));
  assert.ok(patchDiagnostics[0].logic.some((item) => item.includes('addEventListener')));
  assert.ok(patchDiagnostics[0].logic.some((item) => item.includes('function handleAddItem')));
  assert.ok(patchDiagnostics[0].logic.some(hasAddHandlerAndPush));
  function hasAddHandlerAndPush(item) {
    return ['function addItem(event)', 'items.push(item)'].every((phrase) => item.includes(phrase));
  }
  let attempts = 0;
  await assert.rejects(run({ mission, runAttempt: async () => {
    attempts += 1;
    throw failed;
  } }), /test failed/);
  assert.equal(attempts, 10);
  let nonTestAttempts = 0;
  await assert.rejects(run({ mission, runAttempt: async () => {
    nonTestAttempts += 1;
    throw new Error('model unavailable');
  } }), /model unavailable/);
  assert.equal(nonTestAttempts, 1);

  let nonCodeAttempts = 0;
  await assert.rejects(run({ mission: { ...mission, localCodeWorker: false }, runAttempt: async () => {
    nonCodeAttempts += 1;
    throw failed;
  } }), /test failed/);
  assert.equal(nonCodeAttempts, 1);
  console.log('Local code worker repair loop checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
