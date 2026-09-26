'use strict';

const { createHash } = require('crypto');
const { validateSchema, createRelayHandoff, canonicalJson } = require('./variantExecutionService');
const { calculateConflictSeverity, buildCompatibilityMatrix, buildEscalationPaths, buildDivisions, normalizeStopCriteria, validateControlledSummary, calculateAutonomyMetric, buildInternalContracts, buildExternalContracts, defaultTo } = require('./teamVariantHelpers');

function expertCommittee(mission, members) {
  const expertise = members.map((member) => ({
    memberId: memberId(member),
    expertise: [...new Set(member.expertise || member.capabilities || [])],
    verifiedCapabilities: member.verifiedCapabilities || [],
    confidenceLevel: Number.isFinite(member.confidenceLevel) ? member.confidenceLevel : null
  }));

  const conflicts = expertise.flatMap((entry, index) =>
    expertise.slice(index + 1)
      .filter((other) => entry.expertise.some((skill) => other.expertise.includes(skill)))
      .map((other) => ({
        members: [entry.memberId, other.memberId],
        overlap: entry.expertise.filter((skill) => other.expertise.includes(skill)),
        severity: calculateConflictSeverity(entry, other)
      }))
  );

  const protocol = mission.consensusProtocol || {
    quorum: Math.ceil(members.length * 2 / 3),
    dissentRequired: true,
    rounds: 2,
    tieBreak: 'evidence_review',
    calibrationRounds: mission.calibrationRounds || 1,
    evidenceThreshold: mission.evidenceThreshold || 0.7
  };

  if (protocol.quorum < 1 || protocol.quorum > members.length) {
    throw coded('Expert committee quorum is outside team size.', 'ATEAM_CONSENSUS_QUORUM_INVALID');
  }

  return {
    expertiseMatrix: expertise,
    expertiseConflicts: conflicts,
    independence: {
      initialContext: 'mission_and_member_scope_only',
      sharedPeerReviews: false,
      blindReviewEnabled: mission.blindReview !== false,
      noCrossContamination: true
    },
    consensusProtocol: protocol,
    calibrationRequired: true,
    calibrationProcedure: {
      baselineAssessment: true,
      peerCalibrationRounds: protocol.calibrationRounds,
      evidenceStandards: protocol.evidenceThreshold
    },
    dissentProtocol: {
      allowed: true,
      requiredForTieBreak: protocol.dissentRequired,
      recordingRequired: true,
      evidenceBacked: true
    }
  };
}

function interfaceContracts(mission, boundaries, members) {
  const supplied = Array.isArray(mission.interfaceContracts) ? mission.interfaceContracts : [];
  const contracts = boundaries.interfaces.map((boundary) => {
    const found = supplied.find((contract) => contract.fromDomain === boundary.from && contract.toDomain === boundary.to);
    if (!found) throw coded(`Boundary ${boundary.from} → ${boundary.to} requires a semantic interface contract.`, 'ATEAM_INTERFACE_CONTRACT_REQUIRED');
    validateSemanticContract(found, boundary);
    validateEndpointSchemas(found, boundary, members);

    const translationSchema = found.translationSchema || {
      inputFormat: found.inputFormat,
      outputFormat: found.outputFormat,
      transformationRules: found.transformationRules || [],
      validationRules: found.validationRules || []
    };

    return {
      ...found,
      boundaryId: boundary.id,
      provenanceRequired: true,
      compatibilityChecksRequired: true,
      dualValidationRequired: true,
      translationSchema,
      semanticDriftDetection: {
        enabled: true,
        threshold: found.driftThreshold || 0.15,
        checkInterval: found.driftCheckInterval || 3600000,
        lastCheck: null
      },
      provenanceRecord: { transformations: [], validations: { fromDomain: null, toDomain: null } }
    };
  });

  return {
    interfaceContracts: contracts,
    semanticDriftCheck: true,
    globalCompatibilityMatrix: buildCompatibilityMatrix(contracts)
  };
}

function validateSemanticContract(contract, boundary) {
  if (!contract.contractId || !Number.isInteger(contract.version) || !contract.provenance?.sourceRefs?.length) {
    throw coded(`Boundary ${boundary.id} requires a versioned contract and source provenance.`, 'ATEAM_INTERFACE_PROVENANCE_REQUIRED');
  }
  const schema = contract.semanticSchema || contract.translationSchema?.outputSchema;
  if (!schema || validateSchema(schema).length) throw coded(`Boundary ${boundary.id} requires a valid semantic schema.`, 'ATEAM_INTERFACE_SCHEMA_INVALID');
  const translation = contract.translationSchema;
  if (translation && (!Array.isArray(translation.transformationRules) || !translation.transformationRules.length)) {
    throw coded(`Boundary ${boundary.id} translation requires explicit transformation rules.`, 'ATEAM_TRANSLATION_RULES_REQUIRED');
  }
}

function schemasDrifted(source, target, contract) {
  return endpointSchemaDrift(source, contract.producerSchema) || endpointSchemaDrift(target, contract.consumerSchema);
}
function endpointSchemaDrift(actual, expected) { return Boolean(actual && expected && canonicalJson(actual) !== canonicalJson(expected)); }

function validateEndpointSchemas(contract, boundary, members) {
  const from = members.find((member) => memberDomain(member) === boundary.from);
  const to = members.find((member) => memberDomain(member) === boundary.to);
  const source = from && from.outputSchema;
  const target = to && to.inputSchema;
  if (schemasDrifted(source, target, contract)) throw coded(`Boundary ${boundary.id} schemas drifted from the versioned contract.`, 'ATEAM_INTERFACE_SEMANTIC_DRIFT');
  const same = !source || !target || contract.translationSchema || canonicalJson(source) === canonicalJson(target);
  if (!same) throw coded(`Boundary ${boundary.id} needs translation rules for incompatible endpoint schemas.`, 'ATEAM_INTERFACE_TRANSLATION_REQUIRED');
}

function matrixDecisions(mission) {
  const decisions = defaultTo(mission.decisionAuthorities, []);
  if (!decisions.length) throw coded('Matrix team requires authority entries by decision type.', 'ATEAM_MATRIX_AUTHORITY_REQUIRED');

  const types = new Set();
  const raciMatrix = {};
  for (const entry of decisions) {
    if (!entry.decisionType || !entry.functionalOwnerId || !entry.productOwnerId || types.has(entry.decisionType)) {
      throw coded('Matrix decision authorities must uniquely name both owners.', 'ATEAM_MATRIX_AUTHORITY_INVALID');
    }
    types.add(entry.decisionType);

    raciMatrix[entry.decisionType] = {
      responsible: defaultTo(entry.responsibleIds, [entry.functionalOwnerId, entry.productOwnerId]),
      accountable: defaultTo(entry.accountableId, entry.functionalOwnerId),
      consulted: defaultTo(entry.consultedIds, []),
      informed: defaultTo(entry.informedIds, []),
      functionalOwner: entry.functionalOwnerId,
      productOwner: entry.productOwnerId,
      vetoRights: defaultTo(entry.vetoRights, { functional: false, product: false })
    };
  }

  return {
    decisionAuthorities: decisions,
    raciMatrix,
    disagreementResolution: defaultTo(mission.disagreementResolution, 'escalate_to_named_sponsor'),
    transactionalResolution: true,
    escalationPaths: buildEscalationPaths(decisions),
    decisionLog: []
  };
}

function tigerMandate(mission) {
  const mandate = defaultTo(mission.urgentMandate, {});
  if (!mandate.scope || !Number.isFinite(mandate.timeboxMinutes) || mandate.timeboxMinutes <= 0 || !mandate.stopCriteria?.length) {
    throw coded('Tiger team requires a bounded scope, timebox and stop criteria.', 'ATEAM_TIGER_MANDATE_REQUIRED');
  }

  return {
    urgentMandate: {
      ...mandate,
      temporaryPrivileges: defaultTo(mandate.temporaryPrivileges, []),
      auditRequired: true,
      postMortemRequired: true,
      privilegeReturnRequired: true,
      hardTimebox: {
        minutes: mandate.timeboxMinutes,
        enforceAt: Date.now() + mandate.timeboxMinutes * 60000,
        autoTerminate: true
      },
      emergencyScope: {
        bounded: true,
        allowedActions: defaultTo(mandate.allowedActions, []),
        prohibitedActions: defaultTo(mandate.prohibitedActions, []),
        resourceLimits: defaultTo(mandate.resourceLimits, {})
      },
      stopCriteria: normalizeStopCriteria(mandate.stopCriteria),
      auditTrail: {
        enabled: true,
        logAllActions: true,
        immutableLog: true
      },
      privilegeReturn: {
        required: true,
        deadlineMinutes: defaultTo(mandate.privilegeReturnMinutes, 60),
        verificationRequired: true
      },
      postMortem: {
        required: true,
        template: 'tiger_team_postmortem',
        participants: 'all_members',
        deadlineHours: defaultTo(mandate.postMortemHours, 24)
      }
    }
  };
}

function incidentStructure(mission, members) {
  const roles = defaultTo(mission.incidentRoles, {});
  const required = ['commander', 'operations', 'planning', 'logistics'];
  const missing = required.filter((role) => !roles[role] || !members.some((member) => memberId(member) === roles[role]));
  if (missing.length) throw coded(`Incident command is missing assigned ICS roles: ${missing.join(', ')}.`, 'ATEAM_ICS_ROLES_REQUIRED');

  if (!Number.isFinite(mission.sitrepIntervalMinutes) || mission.sitrepIntervalMinutes <= 0 || !mission.operationalObjectives?.length) {
    throw coded('Incident command requires a SITREP cadence and operational objectives.', 'ATEAM_ICS_PERIOD_REQUIRED');
  }

  const spanOfControl = defaultTo(mission.spanOfControl, 5);
  return {
    incidentRoles: roles,
    sitrepIntervalMinutes: mission.sitrepIntervalMinutes,
    operationalObjectives: mission.operationalObjectives,
    incidentTimelineRequired: true,
    handoverRequired: true,
    closureRequired: true,
    spanOfControl,
    divisions: buildDivisions(members, roles, spanOfControl),
    operationalPeriods: {
      current: 1,
      objectives: mission.operationalObjectives,
      sitrepCadence: mission.sitrepIntervalMinutes
    },
    icsStructure: {
      commander: roles.commander,
      operations: roles.operations,
      planning: roles.planning,
      logistics: roles.logistics,
      safety: roles.safety || null,
      liaison: roles.liaison || null,
      publicInfo: roles.publicInfo || null
    },
    handoverProtocol: {
      required: true,
      briefingTemplate: 'ics_handover_briefing',
      acknowledgmentRequired: true
    },
    closureProtocol: {
      required: true,
      finalSitrep: true,
      lessonsLearned: true,
      resourceRelease: true
    }
  };
}

function staffingPlan(mission, members) {
  const required = new Set(defaultTo(mission.requiredCapabilities, []));
  const covered = new Set(members.flatMap((member) => defaultTo(member.capabilities, defaultTo(member.expertise, []))));
  const gaps = [...required].filter((capability) => !covered.has(capability));

  const reconfigurationCost = Number(mission.reconfigurationCost) || 0;
  const hysteresisThreshold = defaultTo(Number(mission.hysteresisThreshold), 0.2);

  return {
    capabilityGaps: gaps,
    staffingActions: gaps.map((capability) => ({
      capability,
      action: 'RECRUIT',
      verificationRequired: true,
      priority: defaultTo(mission.capabilityPriority?.[capability], 'normal'),
      estimatedTime: defaultTo(mission.recruitmentEstimates?.[capability], null)
    })),
    reconfigurationCost,
    hysteresisThreshold,
    continuousStaffing: {
      enabled: true,
      gapDetectionInterval: defaultTo(mission.gapDetectionInterval, 300000),
      autoRecruit: mission.autoRecruit !== false,
      maxConcurrentRecruits: defaultTo(mission.maxConcurrentRecruits, 2)
    },
    morphogenesisTransition: {
      transactional: true,
      requiresEvidenceGate: true,
      planType: 'a_team',
      verificationRequired: true
    },
    memoryTransfer: {
      required: true,
      artifacts: ['expertise_directory', 'transactive_memory', 'handoff_history', 'performance_data'],
      verification: 'checksum'
    },
    thrashingPrevention: {
      minStabilityPeriod: defaultTo(mission.minStabilityPeriod, 1800000),
      maxReconfigurationsPerHour: defaultTo(mission.maxReconfigurationsPerHour, 2)
    }
  };
}

function relayPackage(mission, members) {
  const maxSummaryLength = defaultTo(mission.summaryMaxLength, 500);
  const summary = validateControlledSummary(mission.handoffSummary || '', maxSummaryLength);
  const packageBody = {
    version: defaultTo(Number(mission.handoffVersion), 1),
    sequence: defaultTo(Number(mission.handoffSequence), 1),
    summary,
    state: defaultTo(mission.handoffState, {}),
    artifactRefs: defaultTo(mission.artifactRefs, []),
    evidenceRefs: defaultTo(mission.evidenceRefs, []),
    previousOwner: memberId(members[0]),
    nextOwner: memberId(members[1]),
    timestamp: new Date().toISOString()
  };

  if (!packageBody.evidenceRefs.length) throw coded('Relay handoff requires at least one evidence reference.', 'ATEAM_RELAY_EVIDENCE_REQUIRED');

  const handoff = createRelayHandoff({
    ...packageBody,
    previousOwner: packageBody.previousOwner,
    nextOwner: packageBody.nextOwner
  });

  return {
    relayHandoff: {
      ...handoff,
      receiverValidationRequired: true,
      rollbackOwner: packageBody.previousOwner,
      ownershipLeaseRequired: true,
      leaseDurationMinutes: defaultTo(mission.leaseDurationMinutes, 30),
      controlledSummary: {
        maxLength: maxSummaryLength,
        requiredSections: ['context', 'decisions', 'open_issues', 'next_actions'],
        hash: createHash('sha256').update(JSON.stringify(packageBody.summary)).digest('hex').substring(0, 16)
      },
      stateOwnership: {
        leaseId: createHash('sha256').update(`${packageBody.previousOwner}-${packageBody.nextOwner}-${Date.now()}`).digest('hex').substring(0, 16),
        grantedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + defaultTo(mission.leaseDurationMinutes, 30) * 60000).toISOString()
      },
      rollbackCapability: {
        enabled: true,
        previousOwner: packageBody.previousOwner,
        triggerConditions: ['receiver_rejection', 'validation_failure', 'timeout', 'explicit_request']
      }
    }
  };
}

function podOwnership(mission, members) {
  const owners = members.flatMap((member) =>
    (member.ownedResponsibilities || []).map((artifact) => ({
      artifact,
      owner: memberId(member),
      lifecycle: member.artifactLifecycle || 'design_to_ship',
      verificationRequired: true
    }))
  );

  const externalLimit = Number.isInteger(mission.externalDependencyLimit) ? mission.externalDependencyLimit : 0;
  const dependencies = [...new Set(members.flatMap((member) => member.externalDependencies || []))];
  const duplicateOwners = owners.filter((entry, index) => owners.some((other, otherIndex) => otherIndex !== index && other.artifact === entry.artifact));
  if (duplicateOwners.length) throw coded('Cross-functional pod artifacts require exactly one owner.', 'ATEAM_POD_OWNERSHIP_CONFLICT');
  if (dependencies.length > externalLimit) throw coded('Cross-functional pod exceeds its external dependency limit.', 'ATEAM_POD_EXTERNAL_DEPENDENCY_LIMIT');

  const autonomyScore = calculateAutonomyMetric(dependencies, externalLimit, members);

  return {
    artifactOwners: owners,
    externalDependencyLimit: externalLimit,
    autonomyMetric: {
      dependencies: dependencies.length,
      limit: externalLimit,
      score: autonomyScore,
      trend: 'stable',
      threshold: 0.7
    },
    contractualBoundaries: {
      internalContracts: buildInternalContracts(members),
      externalContracts: buildExternalContracts(mission, members),
      boundaryViolations: []
    },
    fullLifecycleOwnership: {
      design: true,
      build: true,
      test: true,
      ship: true,
      operate: mission.includeOperate || false
    },
    crossTraining: mission.crossTraining || { enabled: false, matrix: [] }
  };
}

function memberId(member = {}) { return member.memberId || member.agentId || member.workerId || member.domain || member.subSystem || member.label || member.role || null; }
function memberDomain(member = {}) { return member.domain || member.subSystem || member.role || member.label || null; }
function coded(message, code) { return Object.assign(new Error(message), { code }); }
module.exports = { expertCommittee, interfaceContracts, matrixDecisions, tigerMandate, incidentStructure, staffingPlan, relayPackage, podOwnership };
