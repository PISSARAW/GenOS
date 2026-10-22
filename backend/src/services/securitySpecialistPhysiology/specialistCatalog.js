'use strict';

const SPECIALIST_CATALOG = Object.freeze({
  network_analyst: Object.freeze({
    specialistId: 'network_analyst',
    title: 'Network Analyst',
    role: 'network_analyst',
    workerKind: 'specialist',
    nicheDomain: 'security:network_routing_ports_pfsense',
    mandate: 'Réseau, routage, ports et pfSense',
    mandateScope: Object.freeze({
      domains: Object.freeze(['network', 'routing', 'ports', 'pfsense', 'firewall_rules']),
      inScopeFormats: Object.freeze(['nmap_xml', 'conftest']),
      forbiddenActions: Object.freeze([
        'modify_firewall_rules',
        'modify_firewall_live',
        'alter_active_directory',
        'promote_decision',
        'spawn_agents',
      ]),
    }),
    declaredCapabilities: Object.freeze(['OBSERVABILITY', 'GRAPH_MEMORY', 'SIGNALING_BUS']),
    minimalToolAllowList: Object.freeze([
      'genos_diagnose',
      'genos_search_failures',
      'genos_organization_state',
      'genos_worker_publish',
      'genos_worker_inbox',
    ]),
    responsibility: Object.freeze({
      owns: Object.freeze(['network_topology', 'routing_exposure', 'pfsense_posture']),
      mayModify: Object.freeze(['network_topology', 'routing_exposure', 'pfsense_posture']),
      mayPropose: Object.freeze(['firewall_rule_hardening', 'port_isolation']),
      mustConsult: Object.freeze(['windows_posture', 'chronology_integrity']),
      mayRead: Object.freeze(['raw_evidence_nmap', 'raw_evidence_conftest', 'network_flows']),
      cannotOverride: Object.freeze(['chronology_integrity', 'independent_audit_verdict', 'ad_gpo_acl']),
    }),
    pipelineStage: 0,
    dependsOn: Object.freeze([]),
    consumes: Object.freeze(['deo_nmap_observations', 'deo_conftest_observations']),
    provides: Object.freeze(['network_surface_assessment', 'pfsense_routing_findings']),
    outputContract: Object.freeze({
      workerArtifactType: 'dossier',
      schemaId: 'genos.security-specialist.network-analyst/v1',
      requiredTopLevelFields: Object.freeze(['outcome', 'claims', 'specialtyAssessment', 'networkFindings']),
      requiredDomainFields: Object.freeze(['exposedPorts', 'routingAnomalies', 'pfsenseRulesChecked']),
    }),
  }),

  windows_analyst: Object.freeze({
    specialistId: 'windows_analyst',
    title: 'Windows Analyst',
    role: 'windows_analyst',
    workerKind: 'specialist',
    nicheDomain: 'security:windows_ad_gpo_acl_evtx',
    mandate: 'AD, GPO, ACL et journaux Windows',
    mandateScope: Object.freeze({
      domains: Object.freeze(['active_directory', 'gpo', 'acl', 'windows_event_logs', 'evtx']),
      inScopeFormats: Object.freeze(['evtx', 'gpo_report', 'hayabusa_csv']),
      forbiddenActions: Object.freeze([
        'modify_domain_controller',
        'edit_gpo_live',
        'promote_decision',
        'spawn_agents',
      ]),
    }),
    declaredCapabilities: Object.freeze(['OBSERVABILITY', 'GRAPH_MEMORY', 'SIGNALING_BUS']),
    minimalToolAllowList: Object.freeze([
      'genos_diagnose',
      'genos_search_failures',
      'genos_organization_state',
      'genos_worker_publish',
      'genos_worker_inbox',
    ]),
    responsibility: Object.freeze({
      owns: Object.freeze(['windows_posture', 'ad_gpo_acl', 'evtx_authentication_analysis']),
      mayModify: Object.freeze(['windows_posture', 'ad_gpo_acl', 'evtx_authentication_analysis']),
      mayPropose: Object.freeze(['gpo_hardening', 'acl_restriction', 'account_containment']),
      mustConsult: Object.freeze(['network_topology', 'chronology_integrity']),
      mayRead: Object.freeze(['raw_evidence_evtx', 'raw_evidence_gpo', 'raw_evidence_hayabusa']),
      cannotOverride: Object.freeze(['network_topology', 'chronology_integrity', 'independent_audit_verdict']),
    }),
    pipelineStage: 0,
    dependsOn: Object.freeze([]),
    consumes: Object.freeze(['deo_evtx_observations', 'deo_gpo_observations', 'deo_hayabusa_observations']),
    provides: Object.freeze(['windows_ad_posture_assessment', 'gpo_acl_findings']),
    outputContract: Object.freeze({
      workerArtifactType: 'dossier',
      schemaId: 'genos.security-specialist.windows-analyst/v1',
      requiredTopLevelFields: Object.freeze(['outcome', 'claims', 'specialtyAssessment', 'windowsFindings']),
      requiredDomainFields: Object.freeze(['adPrincipals', 'gpoPostureFindings', 'aclViolations', 'evtxEventIds']),
    }),
  }),

  forensic_analyst: Object.freeze({
    specialistId: 'forensic_analyst',
    title: 'Forensic Analyst',
    role: 'forensic_analyst',
    workerKind: 'forensic_worker',
    nicheDomain: 'security:forensic_chronology_integrity',
    mandate: 'Chronologie, intégrité et corrélation',
    mandateScope: Object.freeze({
      domains: Object.freeze(['chronology', 'evidence_integrity', 'multi_source_correlation', 'merkle_provenance']),
      inScopeFormats: Object.freeze(['evtx', 'nmap_xml', 'hayabusa_csv', 'gpo_report', 'conftest']),
      forbiddenActions: Object.freeze([
        'invent_missing_timestamps',
        'suppress_contradictions',
        'mutate_raw_vault',
        'promote_decision',
      ]),
    }),
    declaredCapabilities: Object.freeze(['CAPSULES_SNAPSHOTS', 'GRAPH_MEMORY', 'SIGNALING_BUS']),
    minimalToolAllowList: Object.freeze([
      'genos_diagnose',
      'genos_snapshot',
      'genos_replay',
      'genos_search_failures',
      'genos_worker_publish',
      'genos_worker_inbox',
    ]),
    responsibility: Object.freeze({
      owns: Object.freeze(['chronology_integrity', 'evidence_correlation']),
      mayModify: Object.freeze(['chronology_integrity', 'evidence_correlation']),
      mayPropose: Object.freeze(['timeline_reconstruction', 'artifact_quarantine']),
      mustConsult: Object.freeze(['network_topology', 'windows_posture']),
      mayRead: Object.freeze(['deo_dossier', 'merkle_provenance_chain', 'correlation_clusters']),
      cannotOverride: Object.freeze(['independent_audit_verdict', 'remediation_plan']),
    }),
    pipelineStage: 0,
    dependsOn: Object.freeze([]),
    consumes: Object.freeze(['deo_dossier', 'deo_correlations', 'deo_integrity_report']),
    provides: Object.freeze(['verified_chronology', 'causal_correlation_dossier']),
    outputContract: Object.freeze({
      workerArtifactType: 'causal_dossier',
      schemaId: 'genos.security-specialist.forensic-analyst/v1',
      requiredTopLevelFields: Object.freeze(['outcome', 'claims', 'workerArtifact', 'forensicFindings']),
      requiredDomainFields: Object.freeze(['timelineEvents', 'integrityVerified', 'correlationClusterIds']),
    }),
  }),

  threat_analyst: Object.freeze({
    specialistId: 'threat_analyst',
    title: 'Threat Analyst',
    role: 'threat_analyst',
    workerKind: 'red_worker',
    nicheDomain: 'security:incident_hypotheses_qualification',
    mandate: "Hypothèses d'incidents et qualification",
    mandateScope: Object.freeze({
      domains: Object.freeze(['incident_hypotheses', 'kill_chain_qualification', 'adversarial_falsification']),
      inScopeFormats: Object.freeze(['evtx', 'nmap_xml', 'hayabusa_csv', 'gpo_report', 'conftest']),
      forbiddenActions: Object.freeze([
        'execute_live_exploit',
        'override_forensic_integrity',
        'promote_decision',
        'spawn_agents',
      ]),
    }),
    declaredCapabilities: Object.freeze(['GRAPH_MEMORY', 'PROCEDURAL_GUIDANCE', 'OBSERVABILITY', 'SIGNALING_BUS']),
    minimalToolAllowList: Object.freeze([
      'genos_diagnose',
      'genos_execute_strategy_pipeline',
      'genos_search_failures',
      'genos_organization_state',
      'genos_worker_publish',
      'genos_worker_inbox',
    ]),
    responsibility: Object.freeze({
      owns: Object.freeze(['incident_hypotheses', 'threat_qualification']),
      mayModify: Object.freeze(['incident_hypotheses', 'threat_qualification']),
      mayPropose: Object.freeze(['severity_escalation', 'containment_priority']),
      mustConsult: Object.freeze(['network_topology', 'windows_posture', 'chronology_integrity']),
      mayRead: Object.freeze(['network_surface_assessment', 'windows_ad_posture_assessment', 'verified_chronology']),
      cannotOverride: Object.freeze(['chronology_integrity', 'independent_audit_verdict']),
    }),
    pipelineStage: 1,
    dependsOn: Object.freeze(['network_analyst', 'windows_analyst', 'forensic_analyst']),
    consumes: Object.freeze(['network_surface_assessment', 'windows_ad_posture_assessment', 'verified_chronology']),
    provides: Object.freeze(['qualified_incident_hypotheses', 'attack_path_counterexamples']),
    outputContract: Object.freeze({
      workerArtifactType: 'verification_report',
      schemaId: 'genos.security-specialist.threat-analyst/v1',
      requiredTopLevelFields: Object.freeze(['outcome', 'claims', 'workerArtifact', 'threatQualification']),
      requiredDomainFields: Object.freeze(['hypotheses', 'severityQualification', 'falsificationTests']),
    }),
  }),

  remediation_planner: Object.freeze({
    specialistId: 'remediation_planner',
    title: 'Remediation Planner',
    role: 'remediation_planner',
    workerKind: 'specialist',
    nicheDomain: 'security:remediation_dependencies_consequences',
    mandate: 'Solutions, dépendances et conséquences',
    mandateScope: Object.freeze({
      domains: Object.freeze(['remediation_plan', 'dependency_impact', 'blast_radius', 'rollback_design']),
      inScopeFormats: Object.freeze(['evtx', 'nmap_xml', 'hayabusa_csv', 'gpo_report', 'conftest']),
      forbiddenActions: Object.freeze([
        'apply_unapproved_mutation',
        'bypass_promotion_gate',
        'promote_decision',
        'spawn_agents',
      ]),
    }),
    declaredCapabilities: Object.freeze(['STRATEGY_PORTFOLIO', 'CAPSULES_SNAPSHOTS', 'PROCEDURAL_GUIDANCE', 'SIGNALING_BUS']),
    minimalToolAllowList: Object.freeze([
      'genos_diagnose',
      'genos_change_strategy',
      'genos_execute_strategy_pipeline',
      'genos_snapshot',
      'genos_search_failures',
      'genos_worker_publish',
      'genos_worker_inbox',
    ]),
    responsibility: Object.freeze({
      owns: Object.freeze(['remediation_plan', 'dependency_consequences']),
      mayModify: Object.freeze(['remediation_plan', 'dependency_consequences']),
      mayPropose: Object.freeze(['staged_remediation_actions', 'rollback_capsules']),
      mustConsult: Object.freeze(['network_topology', 'windows_posture', 'incident_hypotheses']),
      mayRead: Object.freeze(['qualified_incident_hypotheses', 'network_surface_assessment', 'windows_ad_posture_assessment']),
      cannotOverride: Object.freeze(['chronology_integrity', 'independent_audit_verdict']),
    }),
    pipelineStage: 2,
    dependsOn: Object.freeze(['network_analyst', 'windows_analyst', 'forensic_analyst', 'threat_analyst']),
    consumes: Object.freeze(['qualified_incident_hypotheses', 'network_surface_assessment', 'windows_ad_posture_assessment', 'verified_chronology']),
    provides: Object.freeze(['remediation_action_plan', 'dependency_impact_matrix']),
    outputContract: Object.freeze({
      workerArtifactType: 'dossier',
      schemaId: 'genos.security-specialist.remediation-planner/v1',
      requiredTopLevelFields: Object.freeze(['outcome', 'claims', 'specialtyAssessment', 'remediationPlan']),
      requiredDomainFields: Object.freeze(['proposedActions', 'dependencies', 'consequences', 'rollbackStrategy']),
    }),
  }),

  independent_auditor: Object.freeze({
    specialistId: 'independent_auditor',
    title: 'Independent Auditor',
    role: 'independent_auditor',
    workerKind: 'verifier_worker',
    nicheDomain: 'security:independent_audit_contradictions',
    mandate: 'Validation indépendante et contradictions',
    mandateScope: Object.freeze({
      domains: Object.freeze(['independent_verification', 'contradiction_preservation', 'epistemic_audit']),
      inScopeFormats: Object.freeze(['evtx', 'nmap_xml', 'hayabusa_csv', 'gpo_report', 'conftest']),
      forbiddenActions: Object.freeze([
        'author_remediation_plan',
        'suppress_contradictions',
        'invent_consensus',
        'promote_decision',
      ]),
    }),
    declaredCapabilities: Object.freeze(['GRAPH_MEMORY', 'CAPSULES_SNAPSHOTS', 'OBSERVABILITY', 'SIGNALING_BUS']),
    minimalToolAllowList: Object.freeze([
      'genos_diagnose',
      'genos_replay',
      'genos_snapshot',
      'genos_search_failures',
      'genos_organization_state',
      'genos_worker_publish',
      'genos_worker_inbox',
    ]),
    responsibility: Object.freeze({
      owns: Object.freeze(['independent_audit_verdict', 'contradiction_register']),
      mayModify: Object.freeze(['independent_audit_verdict', 'contradiction_register']),
      mayPropose: Object.freeze(['promotion_block', 'additional_evidence_request']),
      mustConsult: Object.freeze(['chronology_integrity', 'remediation_plan', 'incident_hypotheses']),
      mayRead: Object.freeze(['remediation_action_plan', 'qualified_incident_hypotheses', 'verified_chronology']),
      cannotOverride: Object.freeze(['raw_evidence_vault']),
    }),
    pipelineStage: 3,
    dependsOn: Object.freeze([
      'network_analyst',
      'windows_analyst',
      'forensic_analyst',
      'threat_analyst',
      'remediation_planner',
    ]),
    consumes: Object.freeze([
      'network_surface_assessment',
      'windows_ad_posture_assessment',
      'verified_chronology',
      'qualified_incident_hypotheses',
      'remediation_action_plan',
    ]),
    provides: Object.freeze(['independent_audit_report', 'unresolved_contradictions_ledger']),
    outputContract: Object.freeze({
      workerArtifactType: 'verification_report',
      schemaId: 'genos.security-specialist.independent-auditor/v1',
      requiredTopLevelFields: Object.freeze(['outcome', 'claims', 'workerArtifact', 'auditReport']),
      requiredDomainFields: Object.freeze(['independentVerdict', 'preservedContradictions', 'auditedSpecialists', 'promotionEligible']),
    }),
  }),
});

const SPECIALIST_ORDER = Object.freeze([
  'network_analyst',
  'windows_analyst',
  'forensic_analyst',
  'threat_analyst',
  'remediation_planner',
  'independent_auditor',
]);

function getSpecialistSpec(specialistId) {
  const key = String(specialistId ?? '').trim().toLowerCase();
  const spec = SPECIALIST_CATALOG[key];
  if (!spec) {
    throw Object.assign(new Error(`Unknown security specialist '${specialistId}'.`), {
      code: 'SECURITY_SPECIALIST_UNKNOWN',
    });
  }
  return spec;
}

function listSpecialistSpecs() {
  return SPECIALIST_ORDER.map((id) => SPECIALIST_CATALOG[id]);
}

module.exports = {
  SPECIALIST_CATALOG,
  SPECIALIST_ORDER,
  getSpecialistSpec,
  listSpecialistSpecs,
};
