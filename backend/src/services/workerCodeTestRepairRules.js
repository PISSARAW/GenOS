'use strict';

const REPAIR_PATTERN_1 = /waitForEvent[\s\S]*?download|waiting for event.*download/i;
const REPAIR_PATTERN_2 = /strict mode violation:[\s\S]*?name:\s*\/export json\|export csv\/i[\s\S]*?resolved to 2 elements/i;
const REPAIR_PATTERN_3 = /acceptance\.cjs:29:10/;
const REPAIR_PATTERN_4 = /acceptance\.cjs:24:10/;
const REPAIR_PATTERN_5 = /updated quantity persists|quantity.*reload|reload.*quantity/i;
const REPAIR_PATTERN_6 = /getByLabel\(\/best\.before\/i\)/i;
const REPAIR_PATTERN_7 = /getByLabel\(\/item name\/i\)/i;
const REPAIR_PATTERN_8 = /getByLabel\(\/quantity\/i\)[\s\S]*?(?:Timeout|waiting for)|acceptance\.cjs:15:38/i;
const REPAIR_PATTERN_9 = /0\s*!==\s*1[\s\S]*?acceptance\.cjs:22:10/;
const REPAIR_PATTERN_10 = /getByLabel\(\/quantity\/i\) resolved to \d+ elements|\[object HTMLInputElement\]/i;
const REPAIR_PATTERN_11 = /getByLabel\(\/\^category\$\/i\)/i;
const REPAIR_PATTERN_12 = /getByRole\(\s*'button',\s*\{\s*name:\s*\/increase quantity for oats/i;
const REPAIR_PATTERN_13 = /getByLabel\(\/filter category\/i\)/i;
const REPAIR_PATTERN_14 = /did not find some options/i;
const REPAIR_PATTERN_15 = /getByLabel\(\/search\/i\)/i;
const REPAIR_PATTERN_16 = /AssertionError[\s\S]*show validation feedback/i;
const REPAIR_PATTERN_17 = /AssertionError[\s\S]*?actual:[\s\S]*?expected:/i;
const REPAIR_PATTERN_18 = /(\d+)\s*!==\s*1[\s\S]*?acceptance\.cjs:19:10/;
const REPAIR_PATTERN_19 = /item can be deleted|delete item|deleted item/i;
const REPAIR_PATTERN_20 = /getByRole\(\s*'heading',\s*\{\s*name:\s*\/pantry\/i/;
const REPAIR_PATTERN_21 = /getByLabel\(\/quantity\/i\)[\s\S]*?Timeout/i;
const REPAIR_PATTERN_22 = /resolved to \d+ elements/i;
const REPAIR_PATTERN_23 = /acceptance\.cjs:15:38/i;
const REPAIR_PATTERN_24 = /acceptance\.cjs:24:10/;
const REPAIR_PATTERN_25 = /waitForEvent[\s\S]*?download|waiting for event.*download/i;
const REPAIR_PATTERN_26 = /strict mode violation:[\s\S]*?name:\s*\/export json\|export csv\/i[\s\S]*?resolved to 2 elements/i;
const REPAIR_PATTERN_27 = /acceptance\.cjs:29:10/;
const REPAIR_PATTERN_28 = /0\s*!==\s*1[\s\S]*?acceptance\.cjs:19:10/;
const REPAIR_PATTERN_29 = /getByRole\(\s*'button',\s*\{\s*name:\s*\/delete oats\/i\s*\}\s*\)/i;
const REPAIR_PATTERN_30 = /0\s*!==\s*1[\s\S]*?acceptance\.cjs:22:10/;
const REPAIR_PATTERN_31 = /getByLabel\(\/quantity\/i\) resolved to \d+ elements[\s\S]*?acceptance\.cjs:31:/i;
const REPAIR_PATTERN_32 = /getByLabel\(\/quantity\/i\) resolved to \d+ elements/i;
const REPAIR_PATTERN_33 = /getByLabel\(\/item name\/i\) resolved to \d+ elements/i;
const REPAIR_PATTERN_34 = /getByLabel\(\/item name\/i\)/i;
const REPAIR_PATTERN_35 = /getByLabel\(\/\^category\$\/i\)/i;
const REPAIR_PATTERN_36 = /getByLabel\(\/filter category\/i\)/i;
const REPAIR_PATTERN_37 = /getByLabel\(\/search\/i\)/i;
const REPAIR_PATTERN_38 = /2\s*!==\s*1[\s\S]*?acceptance\.cjs:19:10/;
const REPAIR_PATTERN_39 = /<td\b[^>]*aria-label=["']item name/i;
const REPAIR_PATTERN_40 = /getByLabel\(\/best\.before/i;
const REPAIR_PATTERN_41 = /updated quantity persists|quantity.*reload|reload.*quantity/i;

function testOutput(error) {
  return (error.proposal?.tests || []).map((test) => `${test.stdout || ''}\n${test.stderr || ''}`).join('\n');
}

const hintRules = [
  [REPAIR_PATTERN_1, 'The Export button must trigger a real browser download. Serialize pantry state to a Blob, set an anchor download to a filename ending in .json or .csv, and click the anchor.'],
  [REPAIR_PATTERN_2, 'The oracle export locator must resolve to exactly one button. Keep one visible, keyboard-operable Export JSON button that downloads the current inventory as a .json file; remove or rename any second Export CSV button that also matches the locator.'],
  [REPAIR_PATTERN_3, 'The browser download fired, but its filename failed the extension assertion. Set the actual download attribute to a filename that ends with a literal dot followed by .json or .csv (for example, pantry.json); do not rely on the Blob MIME type alone.'],
  [REPAIR_PATTERN_4, 'The increase button was clicked but the visible row did not reach quantity 3. Update the matching Oats row and the same persisted inventory item, then keep both values synchronized after rendering.'],
  [REPAIR_PATTERN_5, 'The changed quantity is visible but lost after reload. Save the canonical inventory array to localStorage immediately after every add, quantity increment, and delete, using the same storage key that startup reads. Do not save a stale copy or only the initial form values.'],
  [REPAIR_PATTERN_6, 'The best-before date input has no accessible name matching Best-before. Keep its visible associated label and also set aria-label="Best-before date" on the date input.'],
  [REPAIR_PATTERN_7, 'The Item name field is missing its accessible name. Keep the visible label associated with the item-name text input and set aria-label="Item name" on that input; do not use Search as its accessible name.'],
  [REPAIR_PATTERN_8, 'Playwright cannot find the add-form Quantity control. Give the form number input the accessible name Quantity, keep it distinct from any row increment controls, and preserve its visible label association.'],
  [REPAIR_PATTERN_9, 'The item is present before searching, but Search removes the Oats row from the results incorrectly. Filter the canonical items by the current search input value (case-insensitive substring of item.name) and selected category inside renderItems; do not clear or mutate the canonical array when a filter has no match. Keep the Add Item handler and persisted collection intact.'],
  [REPAIR_PATTERN_10, 'The Quantity input locator is ambiguous because an increment button also has an accessible name containing "quantity", or its item name was built from a DOM element (for example, [object HTMLInputElement]). Keep the form field named Quantity. Remove test-only Add Oats buttons and demo action buttons from initial DOM; the pantry starts empty. The increment button must exist only inside the rendered item row after Add Item. In the row, give its action the exact accessible name "Increase quantity for Oats" using the item name string.'],
  [REPAIR_PATTERN_11, 'The exact accessible Category control is missing. Add this associated markup to the add form: <label for="category">Category</label><select id="category" name="category"><option value="Food">Food</option></select>. Do not give the filter select the accessible name Category; label that control Filter category.'],
  [REPAIR_PATTERN_12, 'The Oats row is missing a real button. Render a visible <button type="button" aria-label="Increase quantity for Oats">+</button> inside that row; do not use an input or a text-only span. Its click handler must increment the same item, persist it, and rerender. Create the button from the item name so the accessible label is dynamic.'],
  [REPAIR_PATTERN_13, (output) => REPAIR_PATTERN_14.test(output)
    ? 'The filter select resolves, but Food is missing. Add a visible <option value="Food">Food</option> to the Filter category select; keep it separate from the add-form Category select.'
    : 'The category filter select has no accessible name. Give the filter control aria-label="Filter category" and keep it separate from the add-form select named Category. Ensure it offers Food.'],
  [REPAIR_PATTERN_15, 'The search input is missing its accessible name. Give the search field aria-label="Search" and wire it to the existing item filter.'],
  [REPAIR_PATTERN_16, 'A rejected blank name or non-positive/non-integer quantity must leave the inventory unchanged and show a visible error message in an aria-live region or role=alert; clear it after a valid submission. Keep the feedback associated with the add form and do not rely only on native browser validation.'],
  [REPAIR_PATTERN_17, 'Use the assertion message, stack location, actual value, and expected value as the acceptance evidence. Preserve the existing exported API and project shape; fix the smallest function responsible for the mismatch. Do not rewrite a library into another application or introduce dependencies.']
];

function addItemHint(output) {
  const count = output.match(REPAIR_PATTERN_18);
  if (!count) return '';
  const detail = Number(count[1]) === 0
    ? 'The row is absent after Add Item. Handle submit, prevent navigation, append the form values to the shared items collection, persist, and render immediately.'
    : `Playwright found ${count[1]} visible matches for the expected item name but requires exactly one. Remove any preloaded example row and duplicate submit listeners; each Add Item submit must create one row. Keep item names out of visible action text and expose controls with a distinct accessible name.`;
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
  (output) => REPAIR_PATTERN_19.test(output) && plan('ensure_delete_behavior', 'Delete item'),
  (output) => REPAIR_PATTERN_20.test(output) && plan('ensure_pantry_heading', 'Pantry Inventory'),
  (output) => ((REPAIR_PATTERN_21.test(output)
    && !REPAIR_PATTERN_22.test(output)) || REPAIR_PATTERN_23.test(output))
    && plan('ensure_quantity_input_label', 'Quantity'),
  (output) => REPAIR_PATTERN_24.test(output) && plan('ensure_quantity_increment_behavior', 'Increase quantity for Oats'),
  (output) => REPAIR_PATTERN_25.test(output) && plan('ensure_json_export', 'Export JSON'),
  (output) => REPAIR_PATTERN_26.test(output) && plan('ensure_json_export', 'Export JSON'),
  (output) => REPAIR_PATTERN_27.test(output) && plan('ensure_json_export', 'Export JSON'),
  (output) => REPAIR_PATTERN_28.test(output) && plan('ensure_add_item_behavior', 'Add Item'),
  (output) => REPAIR_PATTERN_29.test(output)
    && plan('ensure_add_item_behavior', 'Add Item'),
  (output) => REPAIR_PATTERN_30.test(output) && plan('ensure_search_filter_behavior', 'Search'),
  (output) => REPAIR_PATTERN_31.test(output) && plan('ensure_quantity_field_after_reload', 'Quantity'),
  (output) => REPAIR_PATTERN_32.test(output) && plan('ensure_quantity_action_label', 'Increase quantity for Oats'),
  (output) => REPAIR_PATTERN_33.test(output) && plan('ensure_unique_item_name_locator', 'Item name'),
  (output) => REPAIR_PATTERN_34.test(output) && plan('ensure_item_name_input_label', 'Item name'),
  (output) => REPAIR_PATTERN_35.test(output) && plan('ensure_accessible_select_label', 'Category'),
  (output) => increaseButtonPattern.test(output) && plan('ensure_quantity_increment_behavior', 'Increase quantity for Oats'),
  (output) => REPAIR_PATTERN_36.test(output) && plan('ensure_filter_select_label', 'Filter category'),
  (output) => REPAIR_PATTERN_37.test(output) && plan('ensure_search_input_label', 'Search'),
  (output, error) => REPAIR_PATTERN_38.test(output)
    && (error.proposal?.failedPatchContents || []).some((patch) => REPAIR_PATTERN_39.test(patch.content || ''))
    && plan('ensure_unique_item_name_locator', 'Item name'),
  (output) => REPAIR_PATTERN_40.test(output) && plan('ensure_best_before_input_label', 'Best-before date'),
  (output) => REPAIR_PATTERN_41.test(output) && plan('ensure_quantity_increment_behavior', 'Increase quantity for Oats')
];

const increaseButtonPattern = new RegExp("getByRole\\(\\s*'button',\\s*\\{\\s*name:\\s*/increase quantity for oats", 'i');

function repairPlan(error) {
  const output = testOutput(error);
  for (const rule of planRules) {
    const result = rule(output, error);
    if (result) return result;
  }
  return null;
}

module.exports = { locatorRepairHint, repairPlan };
