'use strict';

function allocationWitnessRule1(context) {
  return !context.items.length || context.items.length > 24 || !context.groups || context.groups > context.items.length || !context.capacity
    || new context.Set(context.items.map((item) => item.id)).size !== context.items.length
    || context.items.some((item) => !context.Number.isSafeInteger(item.weight) || item.weight < 0);
}

function allocationWitnessRule2(context) {
  return context.capacityMatch?.[1] || context.capacityMatch?.[2] || context.capacityMatch?.[3]
    || context.capacityMatch?.[4] || context.text.match(/\bmax\s*=\s*(\d+)\b/i)?.[1];
}

function allocationWitnessRule3(context) {
  return context.text.match(/\b(\d+)\s+groupes?\b/i)?.[1]
    || context.text.match(/\bgroups\s*=\s*(\d+)\b/i)?.[1]
    || context.text.match(/\bexactly\s+(\d+)\s+non-empty\s+bins\b/i)?.[1];
}

module.exports = { allocationWitnessRule1, allocationWitnessRule2, allocationWitnessRule3 };
