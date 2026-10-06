'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {hash,error,sameScope}=require('./gvxContracts');

async function verifyApplication(profile, applicationId) {
  if(!applicationId||!profile.runtimeDatabaseFile) throw error('GVX_RUNTIME_APPLICATION_PROOF_REQUIRED');
  const filename=fs.realpathSync(path.resolve(profile.runtimeDatabaseFile));
  const sqlite3=require('sqlite3');
  const db=await require('sqlite').open({filename,driver:sqlite3.Database,mode:sqlite3.OPEN_READONLY});
  try {
    const row=await db.get('SELECT * FROM gvx_runtime_operations WHERE id = ?',applicationId);
    validateOperation(profile,row);
    const policy=await db.get('SELECT payload_json FROM adaptive_state WHERE scope = ? AND key = ?',
      'agow_mechanism_policy',profile.agentId);
    if(!policy||hash(JSON.parse(policy.payload_json))!==profile.candidateHash) throw error('GVX_RUNTIME_POLICY_NOT_APPLIED');
  } finally {await db.close();}
}

function validateOperation(profile,row) {
  if(!row||row.status!=='applied'||row.agent_id!==profile.agentId) throw error('GVX_RUNTIME_APPLICATION_NOT_APPLIED');
  const scope={organizationId:row.organization_id,projectId:row.project_id,entityId:row.entity_id};
  const receipt=JSON.parse(row.payload_json);
  if(!sameScope(scope,profile.scope)||receipt.beforeHash!==profile.parentHash||receipt.afterHash!==profile.candidateHash) {
    throw error('GVX_RUNTIME_APPLICATION_SCOPE_MISMATCH');
  }
}

module.exports={verifyApplication};
