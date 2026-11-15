'use strict';

function requiresRestrictedString(context) {
  return !context.validatedReplayPath && !context.FREEFORM_FIELDS.has(context.field) && !context.decisionText && !(context.toolName === 'genos_biomimicry_cryptophasia' && context.field === 'intent');
}

function hasInvalidPrimitiveArguments(context) {
  return context.toolName === 'genos_execute_primitive' && context.args.args !== context.undefined && (typeof context.args.args !== 'object' || context.args.args === null || context.Array.isArray(context.args.args));
}

function hasMissingPrimitiveSelector(context) {
  return context.toolName === 'genos_execute_primitive' && typeof context.args.primitive !== 'string' && typeof context.args.primitive_name !== 'string' && typeof context.args.name !== 'string' && !context.Array.isArray(context.args.primitives);
}

function hasUnsafeArrayValue(context) {
  return context.ARRAY_FIELDS.has(context.field) && context.Array.isArray(context.value) && context.value.some((item) => typeof item !== 'string' || /[\r\n"'`\\;|&<>$]/.test(item));
}

function isOutsideUnitInterval(context) {
  return !context.Number.isFinite(context.numeric) || context.numeric < 0 || context.numeric > 1;
}

function hasInvalidArgumentObject(context) {
  return !context.args || typeof context.args !== 'object' || context.Array.isArray(context.args);
}

function hasProvidedValue(context) {
  return context.value !== context.undefined && context.value !== null && context.String(context.value).trim() !== '';
}

function hasInvalidArrayField(context) {
  return context.ARRAY_FIELDS.has(context.field) && context.value !== context.undefined && !context.Array.isArray(context.value);
}

function hasInvalidMessageIds(context) {
  return !context.Array.isArray(context.ids) || context.ids.some((id) => !context.Number.isInteger(id) || id < 1);
}

function isStatusInspection(context) {
  return context.args.action === context.undefined || context.args.action === null || context.args.action === 'status';
}

function isDecisionTextField(context) {
  return context.toolName === 'genos_record_decision' && (context.field === 'title' || context.field === 'decision');
}

function hasMissingReplaySnapshot(context) {
  return context.toolName === 'genos_replay' && context.args.snapshot === context.undefined && context.args.snapshot_id === context.undefined;
}

function isReplayPathField(context) {
  return context.toolName === 'genos_replay' && context.args.root !== context.undefined && ['root', 'snapshot'].includes(context.field);
}

function hasInvalidStrategyPipeline(context) {
  return context.toolName === 'genos_execute_strategy_pipeline' && !context.Array.isArray(context.args.primitives || context.args.pipeline);
}

function hasArraySignalData(context) {
  return typeof context.args.signal_data === 'object' && context.args.signal_data !== null && context.Array.isArray(context.args.signal_data);
}

function hasInvalidSubsystemList(context) {
  return context.Array.isArray(context.args.sub_systems) && context.args.sub_systems.some((item) => typeof item !== 'string' || item.trim() === '');
}

function hasInvalidReplayPathValue(context) {
  return typeof context.value !== 'string' || !context.value.trim() || context.value.length > context.MAX_STRING_LENGTH
      || /[\0\r\n"'`|&<>$;]/.test(context.value);
}

function hasInvalidReplayPathList(context) {
  return context.args[context.field] !== context.undefined && (!context.Array.isArray(context.args[context.field])
      || context.args[context.field].some((item) => typeof item !== 'string' || /[\0\r\n"'`\\;|&<>$]/.test(item)));
}

module.exports = { requiresRestrictedString, hasInvalidPrimitiveArguments, hasMissingPrimitiveSelector, hasUnsafeArrayValue, isOutsideUnitInterval, hasInvalidArgumentObject, hasProvidedValue, hasInvalidArrayField, hasInvalidMessageIds, isStatusInspection, isDecisionTextField, hasMissingReplaySnapshot, isReplayPathField, hasInvalidStrategyPipeline, hasArraySignalData, hasInvalidSubsystemList, hasInvalidReplayPathValue, hasInvalidReplayPathList };
