use super::Environment;
use crate::mission_protocols::{Store,agentic_ledger as ledger,source};
use genos_api::native_inference::ToolInferenceRequest;
use std::path::{Path,PathBuf};

pub(super) struct Job {
    pub key:ledger::StepKey,
    pub request:ToolInferenceRequest,
    pub permit:ledger::ModelPermit,
}

pub(super) fn database(expected:&Path,workspace:&Path) -> Result<PathBuf,String> {
    let actual=source::journal_path(workspace)?;
    let expected=expected.canonicalize().map_err(|error|error.to_string())?;
    if actual!=expected { return Err("AGENTIC_PARALLEL_NATIVE_JOURNAL_REQUIRED".into()); }
    Ok(actual)
}

pub(super) fn dispatch(environment:&Environment<'_>,job:Job) -> Result<(),String> {
    environment.source.unchanged(environment.workspace)?;
    let database=database(environment.database,environment.workspace)?;
    let mut store=Store::open(&database)?;
    let record=ledger::dispatch_model(&mut store,environment.binding,ledger::ModelDispatch {
        permit:job.permit,request:&job.request }).map_err(|error|error.to_string())?;
    super::super::consume_turn(&mut store,environment.binding,&record)?;
    Ok(())
}
