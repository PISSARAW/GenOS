'use strict';

function testOutput(error) {
  return (error.proposal?.tests || []).map((test) => `${test.stdout || ''}\n${test.stderr || ''}`).join('\n');
}

const hintRules = [
  [/waitForEvent[\s\S]*?download|waiting for event.*download/i, 'The Export button must trigger a real browser download. Serialize pantry state to a Blob, set an anchor download to a filename ending in .json or .csv, and click the anchor.'],
  [/acceptance\.cjs:24:10/, 'The increase button was clicked but the visible row did not reach quantity 3. Update the matching Oats row and the same persisted inventory item, then keep both values synchronized after rendering.'],
  [/updated quantity persists|quantity.*reload|reload.*quantity/i, 'The changed quantity is visible but lost after reload. Save the canonical inventory array to localStorage immediately after every add, quantity increment, and delete, using the same storage key that startup reads. Do not save a stale copy or only the initial form values.'],
  [/getByLabel\(\/best\.before\/i\)/i, 'The best-before date input has no accessible name matching Best-before. Keep its visible associated label and also set aria-label="Best-before date" on the date input.'],
  [/getByLabel\(\/item name\/i\)/i, 'The Item name field is missing its accessible name. Keep the visible label associated with the item-name text input and set aria-label="Item name" on that input; do not use Search as its accessible name.'],
  [/0\s*!==\s*1[\s\S]*?acceptance\.cjs:22:10/, 'The item is present before searching, but Search removes the Oats row from the results incorrectly. Filter the canonical items by the current search input value (case-insensitive substring of item.name) and selected category inside renderItems; do not clear or mutate the canonical array when a filter has no match. Keep the Add Item handler and persisted collection intact.'],
  [/getByLabel\(\/quantity\/i\) resolved to \d+ elements|\[object HTMLInputElement\]/i, 'The Quantity input locator is ambiguous because an increment button also has an accessible name containing "quantity", or its item name was built from a DOM element (for example, [object HTMLInputElement]). Keep the form field named Quantity. Remove test-only Add Oats buttons and demo action buttons from initial DOM; the pantry starts empty. The increment button must exist only inside the rendered item row after Add Item. In the row, give its action the exact accessible name "Increase quantity for Oats" using the item name string.'],
  [/getByLabel\(\/\^category\$\/i\)/i, 'The exact accessible Category control is missing. Add this associated markup to the add form: <label for="category">Category</label><select id="category" name="category"><option value="Food">Food</option></select>. Do not give the filter select the accessible name Category; label that control Filter category.'],
  [/getByRole\(\s*'button',\s*\{\s*name:\s*\/increase quantity for oats/i, 'The Oats row exists, but its quantity action has no accessible name. Give its existing increment button aria-label="Increase quantity for Oats" and ensure its click handler updates the same item, persists quantity 3, and rerenders.'],
  [/getByLabel\(\/filter category\/i\)/i, (output) => /did not find some options/i.test(output)
    ? 'The filter select resolves, but Food is missing. Add a visible <option value="Food">Food</option> to the Filter category select; keep it separate from the add-form Category select.'
    : 'The category filter select has no accessible name. Give the filter control aria-label="Filter category" and keep it separate from the add-form select named Category. Ensure it offers Food.'],
  [/getByLabel\(\/search\/i\)/i, 'The search input is missing its accessible name. Give the search field aria-label="Search" and wire it to the existing item filter.']
];

function addItemHint(output) {
  const count = output.match(/(\d+)\s*!==\s*1[\s\S]*?acceptance\.cjs:19:10/);
  if (!count) return '';
  const detail = Number(count[1]) === 0
    ? 'The row is absent after Add Item. Handle submit, prevent navigation, append the form values to the shared items collection, persist, and render immediately.'
    : `Playwright found ${count[1]} visible text matches for Oats but requires exactly one. Remove any preloaded example Oats row and duplicate submit listeners; each Add Item submit must create one row. Keep Oats out of visible action button text by using accessible aria-labels.`;
  return `${detail} Keep the row compatible with filtering, search, increase and delete behavior.`;
}

function locatorRepairHint(error) {
  const output = testOutput(error);
  const match = hintRules.find(([pattern]) => pattern.test(output));
  return match ? (typeof match[1] === 'function' ? match[1](output) : match[1]) : addItemHint(output);
}

function plan(kind, label) {
  return { kind, label };
}

const planRules = [
  (output) => /acceptance\.cjs:24:10/.test(output) && plan('ensure_quantity_increment_behavior', 'Increase quantity for Oats'),
  (output) => /waitForEvent[\s\S]*?download|waiting for event.*download/i.test(output) && plan('ensure_json_export', 'Export JSON'),
  (output) => /0\s*!==\s*1[\s\S]*?acceptance\.cjs:19:10/.test(output) && plan('ensure_add_item_behavior', 'Add Item'),
  (output) => /0\s*!==\s*1[\s\S]*?acceptance\.cjs:22:10/.test(output) && plan('ensure_search_filter_behavior', 'Search'),
  (output) => /getByLabel\(\/quantity\/i\) resolved to \d+ elements[\s\S]*?acceptance\.cjs:31:/i.test(output) && plan('ensure_quantity_field_after_reload', 'Quantity'),
  (output) => /getByLabel\(\/quantity\/i\) resolved to \d+ elements/i.test(output) && plan('ensure_quantity_action_label', 'Increase quantity for Oats'),
  (output) => /getByLabel\(\/item name\/i\) resolved to \d+ elements/i.test(output) && plan('ensure_unique_item_name_locator', 'Item name'),
  (output) => /getByLabel\(\/item name\/i\)/i.test(output) && plan('ensure_item_name_input_label', 'Item name'),
  (output) => /getByLabel\(\/\^category\$\/i\)/i.test(output) && plan('ensure_accessible_select_label', 'Category'),
  (output) => /getByRole\(\s*'button',\s*\{\s*name:\s*\/increase quantity for oats/i.test(output) && plan('ensure_accessible_button_label', 'Increase quantity for Oats'),
  (output) => /getByLabel\(\/filter category\/i\)/i.test(output) && plan('ensure_filter_select_label', 'Filter category'),
  (output) => /getByLabel\(\/search\/i\)/i.test(output) && plan('ensure_search_input_label', 'Search'),
  (output, error) => /2\s*!==\s*1[\s\S]*?acceptance\.cjs:19:10/.test(output)
    && (error.proposal?.failedPatchContents || []).some((patch) => /<td\b[^>]*aria-label=["']item name/i.test(patch.content || ''))
    && plan('ensure_unique_item_name_locator', 'Item name'),
  (output) => /getByLabel\(\/best\.before/i.test(output) && plan('ensure_best_before_input_label', 'Best-before date'),
  (output) => /updated quantity persists|quantity.*reload|reload.*quantity/i.test(output) && plan('ensure_local_storage_mutations', 'pantryItems')
];

function repairPlan(error) {
  const output = testOutput(error);
  for (const rule of planRules) {
    const result = rule(output, error);
    if (result) return result;
  }
  return null;
}

module.exports = { locatorRepairHint, repairPlan };
