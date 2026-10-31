'use strict';

function allocationWitnessValue1(__genosValueScope1) {
  return !__genosValueScope1.items.length || __genosValueScope1.items.length > 24 || !__genosValueScope1.groups || __genosValueScope1.groups > __genosValueScope1.items.length || !__genosValueScope1.capacity
    || new __genosValueScope1.Set(__genosValueScope1.items.map((item) => item.id)).size !== __genosValueScope1.items.length
    || __genosValueScope1.items.some((item) => !__genosValueScope1.Number.isSafeInteger(item.weight) || item.weight < 0);
}

function allocationWitnessValue2(__genosValueScope2) {
  return __genosValueScope2.capacityMatch?.[1] || __genosValueScope2.capacityMatch?.[2] || __genosValueScope2.capacityMatch?.[3]
    || __genosValueScope2.capacityMatch?.[4] || __genosValueScope2.text.match(/\bmax\s*=\s*(\d+)\b/i)?.[1];
}

function allocationWitnessValue3(__genosValueScope3) {
  return __genosValueScope3.text.match(/\b(\d+)\s+groupes?\b/i)?.[1]
    || __genosValueScope3.text.match(/\bgroups\s*=\s*(\d+)\b/i)?.[1]
    || __genosValueScope3.text.match(/\bexactly\s+(\d+)\s+non-empty\s+bins\b/i)?.[1];
}

module.exports = { allocationWitnessValue1, allocationWitnessValue2, allocationWitnessValue3 };
