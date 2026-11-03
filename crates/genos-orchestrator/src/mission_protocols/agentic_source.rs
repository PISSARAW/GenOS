use super::{agentic_spec::{AgenticConfig,AgenticSpec}, raw_hash, source};
use serde::{Deserialize,Serialize};
use std::path::{Component,Path};

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
#[serde(deny_unknown_fields)]
pub struct Document { pub path:String, pub hash:String, pub text:String }

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
#[serde(deny_unknown_fields)]
pub struct SourceData {
    pub schema:String, pub config_path:String, pub config_hash:String,
    pub config_text:String, pub documents:Vec<Document>,
}

pub struct SourceBundle {
    pub config:AgenticConfig, pub data:SourceData, pub bytes:Vec<u8>, pub source_hash:String,
    _handles:Vec<source::Blob>,
}

pub fn selected(path:&str) -> Result<(),String> {
    if path.is_empty() || path.len()>1024 || path.contains(['\\',':','\0']) {
        return Err("AGENTIC_SOURCE_PATH_INVALID".into());
    }
    for part in Path::new(path).components() {
        let Component::Normal(name)=part else { return Err("AGENTIC_SOURCE_TRAVERSAL_REFUSED".into()); };
        let name=name.to_string_lossy().to_ascii_lowercase();
        if name==".git" || name.starts_with(".genos") || name==".env" || name.starts_with(".env.") {
            return Err("AGENTIC_PRIVATE_SOURCE_REFUSED".into());
        }
    }
    Ok(())
}

pub fn read(workspace:&Path, relative:&str) -> Result<SourceBundle,String> {
    selected(relative)?;
    let config_blob=source::read_blob(workspace,relative)?;
    let config:AgenticConfig=serde_json::from_slice(&config_blob.bytes).map_err(error)?;
    config.validate()?;
    let mut documents=Vec::new();
    let mut handles=vec![config_blob];
    for path in &config.documents {
        let blob=source::read_blob(workspace,path)?;
        documents.push(Document { path:path.clone(),hash:blob.hash.clone(),text:std::str::from_utf8(&blob.bytes).map_err(error)?.into() });
        handles.push(blob);
    }
    bundle(config,(relative,documents),handles)
}

fn bundle(config:AgenticConfig, selected:(&str,Vec<Document>), handles:Vec<source::Blob>) -> Result<SourceBundle,String> {
    let data=SourceData { schema:"genos.rust-agentic-sources/v1".into(),config_path:selected.0.into(),
        config_hash:handles[0].hash.clone(),config_text:std::str::from_utf8(&handles[0].bytes).map_err(error)?.into(),documents:selected.1 };
    let bytes=serde_json::to_vec(&data).map_err(error)?;
    if bytes.len()>1_048_576 { return Err("AGENTIC_SOURCE_BUNDLE_TOO_LARGE".into()); }
    Ok(SourceBundle { config,data,source_hash:raw_hash(&bytes),bytes,_handles:handles })
}

impl SourceBundle {
    pub fn specification(&self, identity:super::llm_source::MissionIdentity) -> Result<AgenticSpec,String> {
        let spec=AgenticSpec { schema:super::agentic_spec::SCHEMA.into(),mission_id:identity.mission_id,
            workspace:identity.workspace,mission:identity.mission,config:self.config.clone(),source:self.data.clone(),
            source_hash:self.source_hash.clone(),timeout_ms:identity.timeout_ms,env_hash:identity.env_hash };
        spec.validate()?;
        Ok(spec)
    }
    pub fn unchanged(&self, workspace:&Path) -> Result<(),String> {
        let current=read(workspace,&self.data.config_path)?;
        if current.source_hash!=self.source_hash { return Err("AGENTIC_SOURCE_OR_CONFIGURATION_CHANGED".into()); }
        Ok(())
    }
}

fn error(error:impl std::fmt::Display) -> String { error.to_string() }
