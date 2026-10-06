'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {digest}=require('./gvxVerifierRegistry');
const {error}=require('./gvxContracts');

async function create(profile) {
  const root=path.resolve(process.env.GENOS_GVX_EVALUATION_WORKSPACE_ROOT||path.join(os.tmpdir(),'genos-gvx-evaluation-worlds'));
  await fs.mkdir(root,{recursive:true,mode:0o711});
  const cwd=await fs.mkdtemp(path.join(root,'world-'));
  try {
    for(const source of profile.sources) await copySource({profile,source,cwd});
    if(profile.executionIdentity) await fs.chown(cwd,profile.executionIdentity.uid,profile.executionIdentity.gid);
    await fs.chmod(cwd,0o755);
    return {cwd,root};
  } catch(failure) {await dispose({cwd,root});throw failure;}
}

async function copySource({profile,source,cwd}) {
  const bytes=await fs.readFile(path.resolve(profile.cwd,source.path));
  if(digest(bytes)!==source.hash) throw error('GVX_EXECUTION_SOURCE_HASH_MISMATCH');
  const target=path.resolve(cwd,source.path);
  if(!target.startsWith(cwd+path.sep)) throw error('GVX_EVALUATION_WORLD_PATH_ESCAPE');
  await fs.mkdir(path.dirname(target),{recursive:true,mode:0o755});
  await fs.writeFile(target,bytes,{flag:'wx',mode:0o444});
}

async function dispose(world) {
  const resolved=path.resolve(world.cwd);
  if(!resolved.startsWith(path.resolve(world.root)+path.sep)||!path.basename(resolved).startsWith('world-')) {
    throw error('GVX_EVALUATION_WORLD_DISPOSAL_ESCAPE');
  }
  await fs.rm(resolved,{recursive:true,force:true});
}

module.exports={create,dispose};
