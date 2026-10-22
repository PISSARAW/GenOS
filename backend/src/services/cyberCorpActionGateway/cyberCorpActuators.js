'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const shreActuators = require('../securityRemediation/shreActuatorRegistry');
const causalVerifier = require('../securityRemediation/causalRemediationVerifier');
const shreWorkflow = require('../securityRemediation/shreWorkflowService');
const { createSecurityAuthorityKernel } = require('../securityAuthorityKernel/securityAuthorityKernel');

function sha256Hex(content) {
  const raw = typeof content === 'string' ? content : JSON.stringify(content);
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function createIsolatedTestVmActuator(options = {}) {
  const workDir = options.workDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'genos-cc-vm-actuator-'));
  fs.mkdirSync(workDir, { recursive: true });
  const vmStatePath = path.join(workDir, 'test-vm-state.json');
  const backupPath = path.join(workDir, 'test-vm-backup.json');
  const initialVmState = {
    vmId: 'test_vm:srv-fin-02-sandbox',
    isolated: true,
    network: 'disabled',
    settings: { firewallEnabled: true, networkIsolation: false, rdpEnabled: true },
    securityControls: ['host_firewall', 'edr_sensor', 'smb_signing'],
    updatedAt: '2026-10-22T09:00:00Z'
  };
  if (!fs.existsSync(vmStatePath)) {
    writeJsonFile(vmStatePath, initialVmState);
    writeJsonFile(backupPath, initialVmState);
  }

  const actuatorId = options.actuatorId ?? 'actuator:cybercorp-isolated-vm';

  return {
    id: actuatorId,
    workDir,
    vmStatePath,
    backupPath,
    getState: () => readJsonFile(vmStatePath),
    getStateDigest: () => sha256Hex(fs.readFileSync(vmStatePath, 'utf8')),
    inspect: async ({ target }) => {
      const current = readJsonFile(vmStatePath);
      const raw = fs.readFileSync(vmStatePath, 'utf8');
      writeJsonFile(backupPath, current);
      const backupDigest = `sha256:${sha256Hex(raw)}`;
      return {
        target,
        state: current,
        stateVersion: `v-${sha256Hex(raw).slice(0, 12)}`,
        preconditionsMet: current.isolated === true,
        alreadyApplied: false,
        rollback: { verifiedBackup: true, backupDigest, documentedReturnPath: true }
      };
    },
    execute: async ({ target, parameters, mandateId }) => {
      const current = readJsonFile(vmStatePath);
      writeJsonFile(backupPath, current);
      const next = {
        ...current,
        settings: { ...current.settings, [parameters.setting]: parameters.value },
        lastMandateId: mandateId,
        updatedAt: '2026-10-22T09:30:00Z'
      };
      writeJsonFile(vmStatePath, next);
      return {
        target,
        appliedSetting: parameters.setting,
        appliedValue: parameters.value,
        afterDigest: sha256Hex(fs.readFileSync(vmStatePath, 'utf8'))
      };
    },
    simulate: async ({ diagnostic }) => {
      const current = readJsonFile(vmStatePath);
      const simDigest = sha256Hex({ simulated: true, current });
      return {
        isolated: current.isolated === true,
        network: current.network,
        sourceDigest: diagnostic.sourceDigest,
        environmentId: 'env:hyperv-isolated-sandbox-01',
        evidenceRefs: [`sim:${simDigest}`],
        predictedImpact: 'Enable networkIsolation and disable RDP on isolated test VM without service loss.',
        riskScore: 0.15,
        impactLevel: 'low',
        passed: true
      };
    },
    apply: async ({ resourceId, change, temporaryPermission }) => {
      if (!temporaryPermission || temporaryPermission.scope !== `security:remediate:${resourceId}` || temporaryPermission.consumed) {
        return { applied: false, permissionConsumed: false, evidenceRefs: ['err:invalid_permission'] };
      }
      const current = readJsonFile(vmStatePath);
      writeJsonFile(backupPath, current);
      const next = {
        ...current,
        settings: { ...current.settings, networkIsolation: true, rdpEnabled: false },
        appliedChange: change,
        updatedAt: '2026-10-22T09:35:00Z'
      };
      writeJsonFile(vmStatePath, next);
      const afterDigest = sha256Hex(fs.readFileSync(vmStatePath, 'utf8'));
      return {
        applied: true,
        permissionConsumed: true,
        evidenceRefs: [`apply:${afterDigest}`],
        afterDigest
      };
    },
    rollback: async () => {
      if (!fs.existsSync(backupPath)) {
        return { rolledBack: false, evidenceRefs: [] };
      }
      const backupRaw = fs.readFileSync(backupPath, 'utf8');
      fs.writeFileSync(vmStatePath, backupRaw, 'utf8');
      const restoredDigest = sha256Hex(backupRaw);
      return {
        rolledBack: true,
        restoredDigest,
        evidenceRefs: [`rollback:${restoredDigest}`]
      };
    }
  };
}

function createIsolatedVmIndependentVerifiers(vmActuator, sourceDigest) {
  const counterVerifierId = 'verifier:cybercorp-isolated-vm-probe';
  const causalVerifierId = 'causal-verifier:cybercorp-isolated-vm';

  const counterVerifier = {
    id: counterVerifierId,
    counterTest: async () => {
      const state = vmActuator.getState();
      const digest = vmActuator.getStateDigest();
      const effectObserved = state.settings.networkIsolation === true && state.settings.rdpEnabled === false;
      const noRegression = Array.isArray(state.securityControls) && state.securityControls.length === 3;
      return {
        effectObserved,
        changeAttributed: effectObserved,
        noRegression,
        verifierId: counterVerifierId,
        evidenceRefs: [`counter:${digest}`]
      };
    }
  };

  const mkRef = (id, tag) => ({ id, digest: sha256Hex(`${id}:${tag}:${vmActuator.getStateDigest()}`) });

  const shreCausalVerifier = {
    id: causalVerifierId,
    assess: async () => {
      const state = vmActuator.getState();
      return {
        unauthorizedActions: 0,
        outOfScopeActions: 0,
        successAnnounced: true,
        independentCounterTestPassed: state.settings.networkIsolation === true,
        actionLedgerEvidence: mkRef('ev-ledger-vm', 'ledger'),
        reproduction: { reproduced: true, evidenceRefs: [mkRef('ev-repro-vm', 'repro')] },
        causality: { finding: 'responsible', evidenceRefs: [mkRef('ev-causal-vm', 'causal')] },
        scope: { changedPaths: ['settings/networkIsolation'], evidenceRefs: [mkRef('ev-scope-vm', 'scope')] },
        lab: { isolatedCopy: true, networkDisabled: true, sourceDigest, correctionPassed: true, evidenceRefs: [mkRef('ev-lab-vm', 'lab')] },
        host: { available: true, evidenceRefs: [mkRef('ev-host-vm', 'host')] },
        security: {
          baselineControls: ['host_firewall', 'edr_sensor', 'smb_signing'],
          activeControls: state.securityControls,
          baselineEvidenceRefs: [mkRef('ev-sec-base', 'sec-base')],
          evidenceRefs: [mkRef('ev-sec-active', 'sec-active')]
        }
      };
    },
    verifyEvidence: async ({ evidence }) => Boolean(evidence && /^[a-f0-9]{64}$/i.test(evidence.digest))
  };

  return { counterVerifier, shreCausalVerifier };
}

function createApprovedLowRiskPfSenseActuator(options = {}) {
  const workDir = options.workDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'genos-cc-pfsense-actuator-'));
  fs.mkdirSync(workDir, { recursive: true });
  const rulesPath = path.join(workDir, 'pfsense-observed-rules.json');
  const baselinePath = path.join(workDir, 'pfsense-baseline-rules.json');

  const baselineRules = [
    { ruleId: 'WAN-BLOCK-DEFAULT', action: 'block', protocol: 'any', port: 'any', enabled: true },
    { ruleId: 'DMZ-HTTPS-443', action: 'pass', protocol: 'tcp', port: 443, enabled: true }
  ];
  const observedRules = [
    ...baselineRules,
    { ruleId: 'TEMP-WAN-DMZ-445', action: 'pass', protocol: 'tcp', port: 445, dest: '10.20.4.12', enabled: true, temporaryException: true }
  ];
  writeJsonFile(baselinePath, baselineRules);
  writeJsonFile(rulesPath, observedRules);

  const kernel = options.kernel ?? createSecurityAuthorityKernel({ secret: 'pfsense-lowrisk-actuator-secret' });

  return {
    id: 'actuator:cybercorp-pfsense-readonly-audit',
    operationId: 'compare_pfsense_rules',
    workDir,
    rulesPath,
    baselinePath,
    inspect: async ({ target, parameters }) => {
      const rawObserved = fs.readFileSync(rulesPath, 'utf8');
      const stateVersion = `pf-${sha256Hex(rawObserved).slice(0, 12)}`;
      return {
        target,
        parameters,
        state: { rulesPath, baselinePath },
        stateVersion,
        preconditionsMet: fs.existsSync(rulesPath) && fs.existsSync(baselinePath),
        alreadyApplied: false
      };
    },
    execute: async ({ target, parameters, actorId, mandateId }) => {
      if (typeof options.requireSakPermit === 'function') {
        options.requireSakPermit({ target, parameters, actorId, mandateId, kernel });
      }
      const observedRaw = fs.readFileSync(rulesPath, 'utf8');
      const baselineRaw = fs.readFileSync(baselinePath, 'utf8');
      const observed = JSON.parse(observedRaw);
      const baseline = JSON.parse(baselineRaw);
      const baselineIds = new Set(baseline.map((r) => r.ruleId));
      const unexpectedRules = observed.filter((r) => !baselineIds.has(r.ruleId));
      return {
        firewall: parameters.firewall,
        baselineId: parameters.baselineId,
        mandateId,
        actorId,
        readOnly: true,
        vmModified: false,
        observedRulesHash: `sha256:${sha256Hex(observedRaw)}`,
        baselineRulesHash: `sha256:${sha256Hex(baselineRaw)}`,
        unexpectedRuleCount: unexpectedRules.length,
        unexpectedRules
      };
    }
  };
}

async function qualifyShreIsolatedVmCycle(db, tenant) {
  const vmActuator = createIsolatedTestVmActuator();
  const initialDigest = vmActuator.getStateDigest();
  const sourceDigest = sha256Hex('cybercorp-shre-vm-case-source');
  const { counterVerifier, shreCausalVerifier } = createIsolatedVmIndependentVerifiers(vmActuator, sourceDigest);

  shreActuators.registerActuator(vmActuator);
  shreActuators.registerVerifier(counterVerifier);
  causalVerifier.clearVerifier(shreCausalVerifier.id);
  causalVerifier.registerVerifier(shreCausalVerifier);

  const created = await shreWorkflow.createDiagnostic(db, tenant, {
    evidenceRefs: ['deo:obs:smb-445-exposure'],
    probableCause: 'Temporary pfSense exception exposed SMB and RDP on sandbox VM',
    uncertainty: 0.1,
    riskScore: 0.85,
    resourceId: 'test_vm:srv-fin-02-sandbox',
    actuatorId: vmActuator.id,
    verifierId: counterVerifier.id,
    causalVerifierId: shreCausalVerifier.id,
    sourceDigest,
    createdBy: 'agent:remediation-planner'
  });

  await shreWorkflow.plan(db, tenant, { caseId: created.caseId, input: {
    minimalChange: 'Enable networkIsolation and disable RDP on srv-fin-02-sandbox',
    expectedImpact: 'Isolates sandbox VM from lateral SMB/RDP paths',
    rollbackPlan: 'Restore verified snapshot backup test-vm-backup.json',
    impactLevel: 'high',
    evidenceRefs: ['plan:vm-isolation-01'],
    changeScope: {
      resourceId: 'test_vm:srv-fin-02-sandbox',
      allowedPaths: ['settings/networkIsolation', 'settings/rdpEnabled'],
      requiredSecurityControls: ['host_firewall', 'edr_sensor', 'smb_signing']
    }
  } });

  await shreWorkflow.simulate(db, tenant, created.caseId);
  await shreWorkflow.authorize(db, tenant, { caseId: created.caseId, input: {
    humanApproval: {
      approved: true,
      approverId: 'operator:secops-commander',
      evidenceRef: 'approval:secops-ticket-001'
    }
  } });
  await shreWorkflow.apply(db, tenant, created.caseId);
  const afterApplyDigest = vmActuator.getStateDigest();
  await shreWorkflow.counterTest(db, tenant, created.caseId);
  const verifiedCase = await shreWorkflow.verifyCausalRemediation(db, tenant, created.caseId);
  const closedCase = await shreWorkflow.close(db, tenant, { caseId: created.caseId, input: {
    decision: 'remediation_verified_and_closed'
  } });

  const rollbackResult = await vmActuator.rollback();
  const afterRollbackDigest = vmActuator.getStateDigest();

  return {
    caseId: created.caseId,
    finalStatus: closedCase.status,
    causalVerificationStatus: verifiedCase.causalVerification.status,
    initialDigest,
    afterApplyDigest,
    afterRollbackDigest,
    stateMutatedOnApply: initialDigest !== afterApplyDigest,
    exactRollbackVerified: initialDigest === afterRollbackDigest && rollbackResult.rolledBack === true
  };
}

module.exports = {
  createIsolatedTestVmActuator,
  createIsolatedVmIndependentVerifiers,
  createApprovedLowRiskPfSenseActuator,
  qualifyShreIsolatedVmCycle
};
