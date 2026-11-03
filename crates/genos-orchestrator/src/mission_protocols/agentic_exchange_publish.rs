use super::{Binding,Event,Head,Store,data,digest};
use super::super::agentic_evidence::{self,Evidence,EvidenceReceipt};
use rusqlite::{Transaction,params};
use serde::{Deserialize,Serialize};
use serde_json::json;

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct Publication {
    pub candidate_id:String,pub binding_hash:String,pub root_hash:String,pub previous_head:Head,pub generation:u64,
    pub closure_hash:String,pub proof_hash:String,pub receipt_hash:String,pub assurance:String,
    pub semantic_truth_verified:bool,pub promotable:bool,pub external_effects_authorized:bool,
}

fn namespace(binding:&Binding,kind:&str)->Result<String,String> { digest(&(binding,"agentic-final-artifact",kind)) }

pub fn publish(store:&mut Store,binding:&Binding,evidence:&Evidence)->Result<Publication,String> {
    store.transaction(binding,|tx| {
        data::ensure(tx)?;
        let accepted=agentic_evidence::accept_in(tx,binding,evidence)?;
        if let Some(previous)=data::publication(tx,binding)? { return validate(tx,(binding,&previous),&accepted); }
        require_base(tx,binding,evidence)?;
        transfer(tx,binding,evidence)?;
        commit(tx,(binding,evidence),&accepted)
    })
}

fn require_base(tx:&Transaction<'_>,binding:&Binding,evidence:&Evidence)->Result<(),String> {
    let subject=evidence.subject();
    let expected=Head { root_hash:subject.base_hash.clone(),generation:subject.base_generation };
    if data::head(tx,binding)?!=expected { return Err("AGENTIC_PUBLICATION_BASE_REEVALUATION_REQUIRED".into()); }
    Ok(())
}

fn transfer(tx:&Transaction<'_>,binding:&Binding,evidence:&Evidence)->Result<(),String> {
    let spec=super::super::agentic_admission::admitted_in(tx,binding)?;
    let source=serde_json::to_vec(&spec.source).map_err(error)?;
    let closure=evidence.closure_bytes()?;
    let subject=evidence.subject();
    let sender=namespace(binding,"sender")?;
    let receiver=namespace(binding,"receiver")?;
    put_pair(tx,(&sender,&receiver),(&subject.source_hash,&source))?;
    put_pair(tx,(&sender,&receiver),(&subject.result_hash,evidence.text().as_bytes()))?;
    put_pair(tx,(&sender,&receiver),(&subject.closure_hash,&closure))?;
    Store::event(tx,binding,Event { protocol:"GQWF",phase:"AGENTIC_FINAL_ARTIFACT_RECEIVED",payload:json!(subject) })
}

fn put_pair(tx:&Transaction<'_>,stores:(&str,&str),object:(&str,&[u8]))->Result<(),String> {
    data::put(tx,(stores.0,object.0,object.1))?;
    let bytes=data::bytes(tx,(stores.0,object.0))?;
    data::put(tx,(stores.1,object.0,&bytes))
}

fn commit(tx:&Transaction<'_>,input:(&Binding,&Evidence),accepted:&EvidenceReceipt)->Result<Publication,String> {
    let (binding,evidence)=input;
    let subject=evidence.subject();
    let generation=subject.base_generation.checked_add(1).ok_or("AGENTIC_HEAD_GENERATION_OVERFLOW")?;
    let receiver=namespace(binding,"receiver")?;
    super::super::agentic_ledger::assert_publishable_in(tx,binding)?;
    let changed=data::sql(tx.execute("UPDATE protocol_gqwf_heads SET store_id=$1,root_hash=$2,generation=$3
        WHERE scope=$4 AND root_hash=$5 AND generation=$6",params![receiver,subject.result_hash,generation,
            data::head_scope(binding)?,subject.base_hash,subject.base_generation]))?;
    if changed!=1 { return Err("AGENTIC_HEAD_CAS_FAILED".into()); }
    finish(tx,input,(accepted,generation))
}

fn finish(tx:&Transaction<'_>,input:(&Binding,&Evidence),proof:(&EvidenceReceipt,u64))->Result<Publication,String> {
    let (binding,evidence)=input;
    let subject=evidence.subject();
    let mut publication=Publication { candidate_id:"final-artifact".into(),binding_hash:digest(binding)?,root_hash:subject.result_hash.clone(),
        previous_head:Head { root_hash:subject.base_hash.clone(),generation:subject.base_generation },generation:proof.1,
        closure_hash:subject.closure_hash.clone(),proof_hash:proof.0.receipt_hash.clone(),receipt_hash:String::new(),
        assurance:proof.0.assurance.clone(),semantic_truth_verified:false,promotable:false,external_effects_authorized:false };
    publication.receipt_hash=hash(&publication)?;
    persist(tx,binding,&publication)?;
    Ok(publication)
}

fn persist(tx:&Transaction<'_>,binding:&Binding,publication:&Publication)->Result<(),String> {
    data::save_publication(tx,binding,publication)?;
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"AGENTIC_EMIT_COMMITTED",payload:json!(publication) })?;
    data::sql(tx.execute("UPDATE rust_protocol_runs SET status='completed' WHERE run_id=$1",[&binding.run_id]))?;
    Store::event(tx,binding,Event { protocol:"GQWF",phase:"AGENTIC_ARTIFACT_PUBLISHED",payload:json!(publication) })
}

fn hash(publication:&Publication)->Result<String,String> {
    let mut value=publication.clone();value.receipt_hash.clear();digest(&("genos.agentic.publication/v1",value))
}

fn validate(tx:&Transaction<'_>,input:(&Binding,&Publication),proof:&EvidenceReceipt)->Result<Publication,String> {
    let (binding,value)=input;
    let subject=&proof.subject;
    let expected=Head { root_hash:subject.base_hash.clone(),generation:subject.base_generation };
    if value.previous_head!=expected || value.generation!=subject.base_generation.checked_add(1).ok_or("AGENTIC_HEAD_GENERATION_OVERFLOW")? {
        return Err("AGENTIC_PUBLICATION_BASE_CORRUPT".into());
    }
    validate_fields(binding,(value,proof))?;
    physical(tx,binding,proof)?;
    let head=Head { root_hash:value.root_hash.clone(),generation:value.generation };
    if data::head(tx,binding)?!=head { return Err("AGENTIC_PUBLICATION_IS_NOT_CURRENT_HEAD".into()); }
    Ok(value.clone())
}

fn validate_fields(binding:&Binding,input:(&Publication,&EvidenceReceipt))->Result<(),String> {
    let (value,proof)=input;
    let actual=(&value.binding_hash,&value.root_hash,&value.closure_hash,&value.proof_hash,value.semantic_truth_verified,value.promotable,value.external_effects_authorized);
    let binding_hash=digest(binding)?;
    let expected=(&binding_hash,&proof.subject.result_hash,&proof.subject.closure_hash,&proof.receipt_hash,false,false,false);
    let identity_ok=value.assurance==proof.assurance && value.candidate_id=="final-artifact";
    if actual!=expected || value.receipt_hash!=hash(value)? || !identity_ok {
        return Err("AGENTIC_PUBLICATION_RECEIPT_CORRUPT".into());
    }
    Ok(())
}

fn physical(tx:&Transaction<'_>,binding:&Binding,proof:&EvidenceReceipt)->Result<(),String> {
    let current=agentic_evidence::qualify_in(tx,binding)?;
    let receiver=namespace(binding,"receiver")?;
    let closure=data::bytes(tx,(&receiver,&proof.subject.closure_hash))?;
    let result=data::bytes(tx,(&receiver,&proof.subject.result_hash))?;
    data::bytes(tx,(&receiver,&proof.subject.source_hash))?;
    if closure!=current.closure_bytes()? || result!=current.text().as_bytes() {
        return Err("AGENTIC_PUBLICATION_CAS_OR_CLOSURE_CHANGED".into());
    }
    Ok(())
}

pub fn publication(store:&mut Store,binding:&Binding)->Result<Option<Publication>,String> {
    store.transaction(binding,|tx| {
        data::ensure(tx)?;
        let Some(value)=data::publication(tx,binding)? else { return Ok(None); };
        let current=agentic_evidence::qualify_in(tx,binding)?;
        let proof=agentic_evidence::require_in(tx,binding,current.subject())?;
        Ok(Some(validate(tx,(binding,&value),&proof)?))
    })
}

pub fn result_bytes(store:&mut Store,binding:&Binding)->Result<Vec<u8>,String> {
    let value=publication(store,binding)?.ok_or("AGENTIC_PUBLICATION_REQUIRED")?;
    store.transaction(binding,|tx|data::bytes(tx,(&namespace(binding,"receiver")?,&value.root_hash)))
}
fn error(error:impl std::fmt::Display)->String { error.to_string() }
