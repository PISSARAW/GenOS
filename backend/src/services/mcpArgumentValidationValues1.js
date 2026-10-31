'use strict';

function validateToolArgumentsValue1(__genosValueScope1) {
  return !__genosValueScope1.validatedReplayPath && !__genosValueScope1.FREEFORM_FIELDS.has(__genosValueScope1.field) && !__genosValueScope1.decisionText && !(__genosValueScope1.toolName === 'genos_biomimicry_cryptophasia' && __genosValueScope1.field === 'intent');
}

function validateToolArgumentsValue2(__genosValueScope2) {
  return __genosValueScope2.toolName === 'genos_execute_primitive' && __genosValueScope2.args.args !== __genosValueScope2.undefined && (typeof __genosValueScope2.args.args !== 'object' || __genosValueScope2.args.args === null || __genosValueScope2.Array.isArray(__genosValueScope2.args.args));
}

function validateToolArgumentsValue3(__genosValueScope3) {
  return __genosValueScope3.toolName === 'genos_execute_primitive' && typeof __genosValueScope3.args.primitive !== 'string' && typeof __genosValueScope3.args.primitive_name !== 'string' && typeof __genosValueScope3.args.name !== 'string' && !__genosValueScope3.Array.isArray(__genosValueScope3.args.primitives);
}

function validateToolArgumentsValue4(__genosValueScope4) {
  return __genosValueScope4.ARRAY_FIELDS.has(__genosValueScope4.field) && __genosValueScope4.Array.isArray(__genosValueScope4.value) && __genosValueScope4.value.some((item) => typeof item !== 'string' || /[\r\n"'`\\;|&<>$]/.test(item));
}

function validateToolArgumentsValue5(__genosValueScope5) {
  return !__genosValueScope5.Number.isFinite(__genosValueScope5.numeric) || __genosValueScope5.numeric < 0 || __genosValueScope5.numeric > 1;
}

function validateToolArgumentsValue6(__genosValueScope6) {
  return !__genosValueScope6.args || typeof __genosValueScope6.args !== 'object' || __genosValueScope6.Array.isArray(__genosValueScope6.args);
}

function validateToolArgumentsValue7(__genosValueScope7) {
  return __genosValueScope7.value !== __genosValueScope7.undefined && __genosValueScope7.value !== null && (0, __genosValueScope7.String)(__genosValueScope7.value).trim() !== '';
}

function validateToolArgumentsValue8(__genosValueScope8) {
  return __genosValueScope8.ARRAY_FIELDS.has(__genosValueScope8.field) && __genosValueScope8.value !== __genosValueScope8.undefined && !__genosValueScope8.Array.isArray(__genosValueScope8.value);
}

function validateToolArgumentsValue9(__genosValueScope9) {
  return !__genosValueScope9.Array.isArray(__genosValueScope9.ids) || __genosValueScope9.ids.some((id) => !__genosValueScope9.Number.isInteger(id) || id < 1);
}

function validateToolArgumentsValue10(__genosValueScope10) {
  return __genosValueScope10.args.action === __genosValueScope10.undefined || __genosValueScope10.args.action === null || __genosValueScope10.args.action === 'status';
}

function validateToolArgumentsValue11(__genosValueScope11) {
  return __genosValueScope11.toolName === 'genos_record_decision' && (__genosValueScope11.field === 'title' || __genosValueScope11.field === 'decision');
}

function validateToolArgumentsValue12(__genosValueScope12) {
  return __genosValueScope12.toolName === 'genos_replay' && __genosValueScope12.args.snapshot === __genosValueScope12.undefined && __genosValueScope12.args.snapshot_id === __genosValueScope12.undefined;
}

function validateToolArgumentsValue13(__genosValueScope13) {
  return __genosValueScope13.toolName === 'genos_replay' && __genosValueScope13.args.root !== __genosValueScope13.undefined && ['root', 'snapshot'].includes(__genosValueScope13.field);
}

function validateToolArgumentsValue14(__genosValueScope14) {
  return __genosValueScope14.toolName === 'genos_execute_strategy_pipeline' && !__genosValueScope14.Array.isArray(__genosValueScope14.args.primitives || __genosValueScope14.args.pipeline);
}

function validateToolArgumentsValue15(__genosValueScope15) {
  return typeof __genosValueScope15.args.signal_data === 'object' && __genosValueScope15.args.signal_data !== null && __genosValueScope15.Array.isArray(__genosValueScope15.args.signal_data);
}

function validateToolArgumentsValue16(__genosValueScope16) {
  return __genosValueScope16.Array.isArray(__genosValueScope16.args.sub_systems) && __genosValueScope16.args.sub_systems.some((item) => typeof item !== 'string' || item.trim() === '');
}

function validateScopedReplayArgumentsValue17(__genosValueScope17) {
  return typeof __genosValueScope17.value !== 'string' || !__genosValueScope17.value.trim() || __genosValueScope17.value.length > __genosValueScope17.MAX_STRING_LENGTH
      || /[\0\r\n"'`|&<>$;]/.test(__genosValueScope17.value);
}

function validateScopedReplayArgumentsValue18(__genosValueScope18) {
  return __genosValueScope18.args[__genosValueScope18.field] !== __genosValueScope18.undefined && (!__genosValueScope18.Array.isArray(__genosValueScope18.args[__genosValueScope18.field])
      || __genosValueScope18.args[__genosValueScope18.field].some((item) => typeof item !== 'string' || /[\0\r\n"'`\\;|&<>$]/.test(item)));
}

module.exports = { validateToolArgumentsValue1, validateToolArgumentsValue2, validateToolArgumentsValue3, validateToolArgumentsValue4, validateToolArgumentsValue5, validateToolArgumentsValue6, validateToolArgumentsValue7, validateToolArgumentsValue8, validateToolArgumentsValue9, validateToolArgumentsValue10, validateToolArgumentsValue11, validateToolArgumentsValue12, validateToolArgumentsValue13, validateToolArgumentsValue14, validateToolArgumentsValue15, validateToolArgumentsValue16, validateScopedReplayArgumentsValue17, validateScopedReplayArgumentsValue18 };
