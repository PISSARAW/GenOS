'use strict';

function validateWorkerSignalData(context) {
if (context.toolName === 'genos_worker_publish' && context.args.signal_data !== context.undefined) {
    if (typeof context.args.signal_data !== 'string' && typeof context.args.signal_data !== 'object') {
      return { value: ( context.invalid('signal_data', 'must be a JSON object or a non-empty string.')) };
    }
    if (typeof context.args.signal_data === 'string' && context.args.signal_data.trim() === '') {
      return { value: ( context.invalid('signal_data', 'must be a non-empty string.')) };
    }
    if (context.require('./mcpArgumentValidationRules.js').hasArraySignalData({ Array: context.Array, args: context.args })) {
      return { value: ( context.invalid('signal_data', 'must be a JSON object, not an array.')) };
    }
  }
}

function validateFieldShapesAndBounds(context) {
for (const [field, value] of context.Object.entries(context.args)) {
    if (typeof value === 'string') {
      if (value.includes('\0')) return { value: ( context.invalid(field, 'contains null bytes.')) };
      const decisionText = context.require('./mcpArgumentValidationRules.js').isDecisionTextField({ field, toolName: context.toolName });
      const validatedReplayPath = context.require('./mcpArgumentValidationRules.js').isReplayPathField({ args: context.args, field, toolName: context.toolName, undefined: context.undefined });
      if (context.require('./mcpArgumentValidationRules.js').requiresRestrictedString({ FREEFORM_FIELDS: context.FREEFORM_FIELDS, decisionText, field, toolName: context.toolName, validatedReplayPath })) {
        if (/[\r\n]/.test(value) || /["'`\\;|&<>$]/.test(value)) return { value: ( context.invalid(field, 'contains forbidden command characters.')) };
        if (/\s/.test(value)) return { value: ( context.invalid(field, 'must not contain whitespace.')) };
      }
    }
    if (context.require('./mcpArgumentValidationRules.js').hasInvalidArrayField({ ARRAY_FIELDS: context.ARRAY_FIELDS, Array: context.Array, field, undefined: context.undefined, value })) return { value: ( context.invalid(field, 'must be an array.')) };
    if (context.require('./mcpArgumentValidationRules.js').hasUnsafeArrayValue({ ARRAY_FIELDS: context.ARRAY_FIELDS, Array: context.Array, field, value })) return { value: ( context.invalid(field, 'must contain only safe strings.')) };
    if (context.NON_NEGATIVE_FIELDS.has(field) && value !== context.undefined) {
      const numeric = context.Number(value);
      if (!context.Number.isFinite(numeric) || numeric < 0) return { value: ( context.invalid(field, 'must be a finite non-negative number.')) };
    }
    if (context.MAX_ONE_FIELDS.has(field) && value !== context.undefined) {
      const numeric = context.Number(value);
      if (context.require('./mcpArgumentValidationRules.js').isOutsideUnitInterval({ Number: context.Number, numeric })) return { value: ( context.invalid(field, 'must be a finite number between 0 and 1.')) };
    }
  }
}

function validatePreviewSubsystems(context) {
if (context.toolName === 'genos_a_team_preview' && context.args.sub_systems !== context.undefined) {
    if (!context.Array.isArray(context.args.sub_systems) && typeof context.args.sub_systems !== 'string') {
      return { value: ( context.invalid('sub_systems', 'must be an array of strings or a comma-separated string.')) };
    }
    if (context.require('./mcpArgumentValidationRules.js').hasInvalidSubsystemList({ Array: context.Array, args: context.args })) {
      return { value: ( context.invalid('sub_systems', 'must contain only non-empty strings.')) };
    }
  }
}

function validateStdpAliases(context) {
if (context.toolName === 'genos_synaptic_stdp_update') {
    const aliasGroups = [
      ['source_id', 'sourceId', 'causeId'],
      ['target_id', 'targetId', 'effectId'],
      ['pre_spike_at', 'preSpikeAt'],
      ['post_spike_at', 'postSpikeAt'],
      ['learning_rate', 'learningRate', 'outcome_score'],
      ['transmitter_type', 'transmitterType', 'trait'],
      ['agent_id', 'agentId']
    ];
    for (const aliases of aliasGroups) {
      const provided = aliases.filter((alias) => context.args[alias] !== context.undefined && context.args[alias] !== null);
      const values = [...new context.Set(provided.map((alias) => context.String(context.args[alias])))];
      if (values.length > 1) return { value: ( context.invalid(aliases[0], `conflicting aliases supplied: ${provided.join(', ')}.`)) };
    }
    const legacyAliases = ['sourceId', 'targetId', 'preSpikeAt', 'postSpikeAt', 'learningRate', 'transmitterType', 'agentId'];
    if (legacyAliases.some((field) => context.Object.prototype.hasOwnProperty.call(context.args, field))) {
      return { value: ( context.invalid('args', `MCP uses snake_case fields; use ${legacyAliases.map((field) => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)).join(', ')}.`)) };
    }
  }
}

function validateRagAction(context) {
if (context.toolName === 'genos_deterministic_sha256_rag') {
    if (!['ingest', 'search'].includes(context.args.action)) return { value: ( context.invalid('action', 'must be ingest or search.')) };
    const field = context.args.action === 'ingest' ? 'document' : 'query';
    const error = context.validateString(context.args[field], field, true);
    if (error) return { value: ( error) };
  }
}

function validateRequiredAlternatives(context) {
if (context.required && !context.statusInspection) {
    for (const field of context.required) {
      // 'a|b' = au moins l'un des deux doit être fourni (alias acceptés).
      const alternatives = context.String(field).split('|');
      const provided = alternatives.some((name) => {
        const value = context.args[name];
        return context.require('./mcpArgumentValidationRules.js').hasProvidedValue({ String: context.String, undefined: context.undefined, value });
      });
      if (!provided) return { value: ( context.invalid(alternatives[0], 'is required.')) };
    }
  }
}

function validateReplayPaths(context) {
if (context.toolName === 'genos_replay' && context.args.root !== context.undefined) {
    const error = context.validateReplaySnapshotPath(context.args.root, context.args.snapshot);
    if (error) return { value: ( error) };
  }
}

function validateInboxAcknowledgements(context) {
if (context.toolName === 'genos_worker_inbox' && context.args.acknowledge_message_ids !== context.undefined) {
    const ids = context.args.acknowledge_message_ids;
    if (context.require('./mcpArgumentValidationRules.js').hasInvalidMessageIds({ Array: context.Array, Number: context.Number, ids })) {
      return { value: ( context.invalid('acknowledge_message_ids', 'must contain only positive integer message IDs.')) };
    }
  }
}

function validateDeclaredRequiredStrings(context) {
for (const field of context.declaredRequired) {
    const error = context.validateString(context.args[field], field, true);
    if (error) return { value: ( error) };
  }
}

function validateProceduralRunnerId(context) {
if (context.toolName === 'genos_procedural_runner_resolve' && typeof context.args.id !== 'string') {
    return { value: ( context.invalid('id', 'id must be a string.')) };
  }
}

function validateWorkerMessageKind(context) {
if (context.toolName === 'genos_worker_publish' && !context.ORGANIZATION_MESSAGE_KINDS.has(context.args.kind)) {
    return { value: ( context.invalid('kind', 'must be a supported immutable organization message kind.')) };
  }
}

function validateProceduralRegistryScope(context) {
if (context.toolName === 'genos_procedural_registry_list' && !['runners', 'evaluators', 'environments', 'snapshots'].includes(context.args.scope)) {
    return { value: ( context.invalid('scope', 'scope must be one of: runners, evaluators, environments, snapshots.')) };
  }
}

function validateCellDivisionAliases(context) {
if (context.toolName === 'genos_cell_division') {
    const legacyAliases = ['agentId', 'daughterVolume', 'mutationRate', 'hayflickLimit', 'merozoiteCount'];
    if (legacyAliases.some((field) => context.Object.prototype.hasOwnProperty.call(context.args, field))) {
      return { value: ( context.invalid('args', 'MCP uses snake_case fields for cell division.')) };
    }
  }
}

function validateScopedReplayArguments(context) {
for (const field of ['root', 'snapshot']) {
    const value = context.args[field];
    if (value === context.undefined) continue;
    if (context.require('./mcpArgumentValidationRules.js').hasInvalidReplayPathValue({ MAX_STRING_LENGTH: context.MAX_STRING_LENGTH, value })) return { value: ( context.invalid(field, 'must be a safe capsule path.')) };
  }
}

module.exports = { validateWorkerSignalData, validateFieldShapesAndBounds, validatePreviewSubsystems, validateStdpAliases, validateRagAction, validateRequiredAlternatives, validateReplayPaths, validateInboxAcknowledgements, validateDeclaredRequiredStrings, validateProceduralRunnerId, validateWorkerMessageKind, validateProceduralRegistryScope, validateCellDivisionAliases, validateScopedReplayArguments };
