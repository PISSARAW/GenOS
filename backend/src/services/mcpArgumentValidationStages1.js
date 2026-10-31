'use strict';

function validateToolArgumentsStage1(__genosStageScope1) {
if (__genosStageScope1.toolName === 'genos_worker_publish' && __genosStageScope1.args.signal_data !== __genosStageScope1.undefined) {
    if (typeof __genosStageScope1.args.signal_data !== 'string' && typeof __genosStageScope1.args.signal_data !== 'object') {
      return { value: ( (0, __genosStageScope1.invalid)('signal_data', 'must be a JSON object or a non-empty string.')) };
    }
    if (typeof __genosStageScope1.args.signal_data === 'string' && __genosStageScope1.args.signal_data.trim() === '') {
      return { value: ( (0, __genosStageScope1.invalid)('signal_data', 'must be a non-empty string.')) };
    }
    if ((0, __genosStageScope1.require)('./mcpArgumentValidationValues1.js').validateToolArgumentsValue15({ Array: __genosStageScope1.Array, args: __genosStageScope1.args })) {
      return { value: ( (0, __genosStageScope1.invalid)('signal_data', 'must be a JSON object, not an array.')) };
    }
  }
}

function validateToolArgumentsStage2(__genosStageScope2) {
for (const [field, value] of __genosStageScope2.Object.entries(__genosStageScope2.args)) {
    if (typeof value === 'string') {
      if (value.includes('\0')) return { value: ( (0, __genosStageScope2.invalid)(field, 'contains null bytes.')) };
      const decisionText = (0, __genosStageScope2.require)('./mcpArgumentValidationValues1.js').validateToolArgumentsValue11({ field, toolName: __genosStageScope2.toolName });
      const validatedReplayPath = (0, __genosStageScope2.require)('./mcpArgumentValidationValues1.js').validateToolArgumentsValue13({ args: __genosStageScope2.args, field, toolName: __genosStageScope2.toolName, undefined: __genosStageScope2.undefined });
      if ((0, __genosStageScope2.require)('./mcpArgumentValidationValues1.js').validateToolArgumentsValue1({ FREEFORM_FIELDS: __genosStageScope2.FREEFORM_FIELDS, decisionText, field, toolName: __genosStageScope2.toolName, validatedReplayPath })) {
        if (/[\r\n]/.test(value) || /["'`\\;|&<>$]/.test(value)) return { value: ( (0, __genosStageScope2.invalid)(field, 'contains forbidden command characters.')) };
        if (/\s/.test(value)) return { value: ( (0, __genosStageScope2.invalid)(field, 'must not contain whitespace.')) };
      }
    }
    if ((0, __genosStageScope2.require)('./mcpArgumentValidationValues1.js').validateToolArgumentsValue8({ ARRAY_FIELDS: __genosStageScope2.ARRAY_FIELDS, Array: __genosStageScope2.Array, field, undefined: __genosStageScope2.undefined, value })) return { value: ( (0, __genosStageScope2.invalid)(field, 'must be an array.')) };
    if ((0, __genosStageScope2.require)('./mcpArgumentValidationValues1.js').validateToolArgumentsValue4({ ARRAY_FIELDS: __genosStageScope2.ARRAY_FIELDS, Array: __genosStageScope2.Array, field, value })) return { value: ( (0, __genosStageScope2.invalid)(field, 'must contain only safe strings.')) };
    if (__genosStageScope2.NON_NEGATIVE_FIELDS.has(field) && value !== __genosStageScope2.undefined) {
      const numeric = (0, __genosStageScope2.Number)(value);
      if (!__genosStageScope2.Number.isFinite(numeric) || numeric < 0) return { value: ( (0, __genosStageScope2.invalid)(field, 'must be a finite non-negative number.')) };
    }
    if (__genosStageScope2.MAX_ONE_FIELDS.has(field) && value !== __genosStageScope2.undefined) {
      const numeric = (0, __genosStageScope2.Number)(value);
      if ((0, __genosStageScope2.require)('./mcpArgumentValidationValues1.js').validateToolArgumentsValue5({ Number: __genosStageScope2.Number, numeric })) return { value: ( (0, __genosStageScope2.invalid)(field, 'must be a finite number between 0 and 1.')) };
    }
  }
}

function validateToolArgumentsStage3(__genosStageScope3) {
if (__genosStageScope3.toolName === 'genos_a_team_preview' && __genosStageScope3.args.sub_systems !== __genosStageScope3.undefined) {
    if (!__genosStageScope3.Array.isArray(__genosStageScope3.args.sub_systems) && typeof __genosStageScope3.args.sub_systems !== 'string') {
      return { value: ( (0, __genosStageScope3.invalid)('sub_systems', 'must be an array of strings or a comma-separated string.')) };
    }
    if ((0, __genosStageScope3.require)('./mcpArgumentValidationValues1.js').validateToolArgumentsValue16({ Array: __genosStageScope3.Array, args: __genosStageScope3.args })) {
      return { value: ( (0, __genosStageScope3.invalid)('sub_systems', 'must contain only non-empty strings.')) };
    }
  }
}

function validateToolArgumentsStage4(__genosStageScope4) {
if (__genosStageScope4.toolName === 'genos_synaptic_stdp_update') {
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
      const provided = aliases.filter((alias) => __genosStageScope4.args[alias] !== __genosStageScope4.undefined && __genosStageScope4.args[alias] !== null);
      const values = [...new __genosStageScope4.Set(provided.map((alias) => (0, __genosStageScope4.String)(__genosStageScope4.args[alias])))];
      if (values.length > 1) return { value: ( (0, __genosStageScope4.invalid)(aliases[0], `conflicting aliases supplied: ${provided.join(', ')}.`)) };
    }
    const legacyAliases = ['sourceId', 'targetId', 'preSpikeAt', 'postSpikeAt', 'learningRate', 'transmitterType', 'agentId'];
    if (legacyAliases.some((field) => __genosStageScope4.Object.prototype.hasOwnProperty.call(__genosStageScope4.args, field))) {
      return { value: ( (0, __genosStageScope4.invalid)('args', `MCP uses snake_case fields; use ${legacyAliases.map((field) => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)).join(', ')}.`)) };
    }
  }
}

function validateToolArgumentsStage5(__genosStageScope5) {
if (__genosStageScope5.toolName === 'genos_deterministic_sha256_rag') {
    if (!['ingest', 'search'].includes(__genosStageScope5.args.action)) return { value: ( (0, __genosStageScope5.invalid)('action', 'must be ingest or search.')) };
    const field = __genosStageScope5.args.action === 'ingest' ? 'document' : 'query';
    const error = (0, __genosStageScope5.validateString)(__genosStageScope5.args[field], field, true);
    if (error) return { value: ( error) };
  }
}

function validateToolArgumentsStage6(__genosStageScope6) {
if (__genosStageScope6.required && !__genosStageScope6.statusInspection) {
    for (const field of __genosStageScope6.required) {
      // 'a|b' = au moins l'un des deux doit être fourni (alias acceptés).
      const alternatives = (0, __genosStageScope6.String)(field).split('|');
      const provided = alternatives.some((name) => {
        const value = __genosStageScope6.args[name];
        return (0, __genosStageScope6.require)('./mcpArgumentValidationValues1.js').validateToolArgumentsValue7({ String: __genosStageScope6.String, undefined: __genosStageScope6.undefined, value });
      });
      if (!provided) return { value: ( (0, __genosStageScope6.invalid)(alternatives[0], 'is required.')) };
    }
  }
}

function validateToolArgumentsStage7(__genosStageScope7) {
if (__genosStageScope7.toolName === 'genos_replay' && __genosStageScope7.args.root !== __genosStageScope7.undefined) {
    const error = (0, __genosStageScope7.validateReplaySnapshotPath)(__genosStageScope7.args.root, __genosStageScope7.args.snapshot);
    if (error) return { value: ( error) };
  }
}

function validateToolArgumentsStage8(__genosStageScope8) {
if (__genosStageScope8.toolName === 'genos_worker_inbox' && __genosStageScope8.args.acknowledge_message_ids !== __genosStageScope8.undefined) {
    const ids = __genosStageScope8.args.acknowledge_message_ids;
    if ((0, __genosStageScope8.require)('./mcpArgumentValidationValues1.js').validateToolArgumentsValue9({ Array: __genosStageScope8.Array, Number: __genosStageScope8.Number, ids })) {
      return { value: ( (0, __genosStageScope8.invalid)('acknowledge_message_ids', 'must contain only positive integer message IDs.')) };
    }
  }
}

function validateToolArgumentsStage9(__genosStageScope9) {
for (const field of __genosStageScope9.declaredRequired) {
    const error = (0, __genosStageScope9.validateString)(__genosStageScope9.args[field], field, true);
    if (error) return { value: ( error) };
  }
}

function validateToolArgumentsStage10(__genosStageScope10) {
if (__genosStageScope10.toolName === 'genos_procedural_runner_resolve' && typeof __genosStageScope10.args.id !== 'string') {
    return { value: ( (0, __genosStageScope10.invalid)('id', 'id must be a string.')) };
  }
}

function validateToolArgumentsStage11(__genosStageScope11) {
if (__genosStageScope11.toolName === 'genos_worker_publish' && !__genosStageScope11.ORGANIZATION_MESSAGE_KINDS.has(__genosStageScope11.args.kind)) {
    return { value: ( (0, __genosStageScope11.invalid)('kind', 'must be a supported immutable organization message kind.')) };
  }
}

function validateToolArgumentsStage12(__genosStageScope12) {
if (__genosStageScope12.toolName === 'genos_procedural_registry_list' && !['runners', 'evaluators', 'environments', 'snapshots'].includes(__genosStageScope12.args.scope)) {
    return { value: ( (0, __genosStageScope12.invalid)('scope', 'scope must be one of: runners, evaluators, environments, snapshots.')) };
  }
}

function validateToolArgumentsStage13(__genosStageScope13) {
if (__genosStageScope13.toolName === 'genos_cell_division') {
    const legacyAliases = ['agentId', 'daughterVolume', 'mutationRate', 'hayflickLimit', 'merozoiteCount'];
    if (legacyAliases.some((field) => __genosStageScope13.Object.prototype.hasOwnProperty.call(__genosStageScope13.args, field))) {
      return { value: ( (0, __genosStageScope13.invalid)('args', 'MCP uses snake_case fields for cell division.')) };
    }
  }
}

function validateScopedReplayArgumentsStage14(__genosStageScope14) {
for (const field of ['root', 'snapshot']) {
    const value = __genosStageScope14.args[field];
    if (value === __genosStageScope14.undefined) continue;
    if ((0, __genosStageScope14.require)('./mcpArgumentValidationValues1.js').validateScopedReplayArgumentsValue17({ MAX_STRING_LENGTH: __genosStageScope14.MAX_STRING_LENGTH, value })) return { value: ( (0, __genosStageScope14.invalid)(field, 'must be a safe capsule path.')) };
  }
}

module.exports = { validateToolArgumentsStage1, validateToolArgumentsStage2, validateToolArgumentsStage3, validateToolArgumentsStage4, validateToolArgumentsStage5, validateToolArgumentsStage6, validateToolArgumentsStage7, validateToolArgumentsStage8, validateToolArgumentsStage9, validateToolArgumentsStage10, validateToolArgumentsStage11, validateToolArgumentsStage12, validateToolArgumentsStage13, validateScopedReplayArgumentsStage14 };
