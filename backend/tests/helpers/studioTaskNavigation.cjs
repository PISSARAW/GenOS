'use strict';

async function view(page, id) {
  const modal = page.locator('#node-inspector-dialog[open]');
  if (await modal.count()) await modal.getByRole('button', { name: 'Fermer l’inspecteur' }).click();
  const menu = page.locator('#view-menu');
  if (await menu.isVisible()) await menu.selectOption(id);
  else {
    const button = page.locator('[data-target="' + id + '"]').first();
    if (!await button.isVisible()) await reveal(page, button);
    await button.click();
  }
}

async function ownerOf(target) {
  return target.evaluate(element => ({
    view: element.closest('[data-view]')?.id,
    pane: element.closest('.task-pane')?.id,
    operation: element.closest('[data-operation]')?.dataset.operation,
    picker: element.closest('.operation-body')?.parentElement.id,
    inspector: Boolean(element.closest('.builder-inspector')),
    context: Boolean(element.closest('.session-context'))
  }));
}

async function selectPane(page, owner) {
  if (!owner.pane) return;
  const root = page.locator('#' + owner.view);
  const choice = root.locator('.task-choice select');
  if (await choice.isVisible()) await choice.selectOption(owner.pane);
  else await root.locator('[aria-controls="' + owner.pane + '"]').click();
}

async function disclose(page, target, owner) {
  if (owner.context && !await target.isVisible()) await page.locator('.session-context > summary').click();
  if (owner.inspector && !await target.isVisible()) await click(page, page.locator('.mobile-inspector-button'));
  const closed = await target.evaluate(element => {
    const ids = [];
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.tagName === 'DETAILS' && !ancestor.open) ids.unshift(ancestor.querySelector(':scope > summary').textContent);
    }
    return ids;
  });
  for (const title of closed) await page.getByText(title, { exact: true }).click();
}

async function reveal(page, target) {
  const owner = await ownerOf(target);
  const modal = page.locator('#node-inspector-dialog[open]');
  if (await modal.count() && !owner.inspector) await modal.getByRole('button', { name: 'Fermer l’inspecteur' }).click();
  if (owner.view && !await page.locator('#' + owner.view).isVisible()) await view(page, owner.view);
  await selectPane(page, owner);
  if (owner.operation) await page.locator('#' + owner.picker + '-choice').selectOption(owner.operation);
  await disclose(page, target, owner);
}

async function click(page, target) { await reveal(page, target); await target.click(); }
async function fill(page, target, value) { await reveal(page, target); await target.fill(value); }
async function select(page, target, value) { await reveal(page, target); await target.selectOption(value); }

module.exports = { view, reveal, click, fill, select };
