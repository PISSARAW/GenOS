'use strict';

async function buildCausalBlame(context) {
while (context.require('./causalOpsRules.cjs').buildCausalBlame({ get current() { return context.current; } })) {
    context.current = await context.getCommit(context.db, context.current.parentIds[0]);
    if (!context.current || context.visited.has(context.current.id)) break;
    context.visited.add(context.current.id);
    for (const item of context.sectionItems(context.current)) {
      const id = context.identityOf(context.section, item);
      if (id === context.undefined) continue;
      const existing = context.attribution.get(id);
      if (existing && existing.value === context.canonicalize(item)) {
        context.attribution.set(id, {
          commitId: context.current.id,
          item,
          value: existing.value,
          createdAt: context.current.created_at,
          createdBy: context.current.created_by || 'unknown'
        });
      }
    }
  }
}

function checkOutcomeInvariants(context) {
if (context.state.runs && context.Array.isArray(context.state.runs)) context.invariants.budgetsConsistent = context.checkBudgets(context.state.runs);
}

module.exports = { buildCausalBlame, checkOutcomeInvariants };
