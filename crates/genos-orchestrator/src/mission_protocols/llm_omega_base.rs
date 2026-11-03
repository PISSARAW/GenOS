use super::super::{Binding, digest, raw_hash};
use rusqlite::{Connection,params};

pub(super) fn require(connection: &Connection, binding: &Binding, context: &super::super::llm_synapse::AppliedContext) -> Result<(),String> {
    let scope = digest(&(&binding.mission_id,&binding.workspace))?;
    let row: (String,String,u64) = super::data::sql(connection.query_row("SELECT store_id,root_hash,generation
        FROM protocol_gqwf_heads WHERE scope=$1",[scope],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))))?;
    if row.1 != context.world_hash || row.2 != context.world_generation { return Err("LLM_OMEGA_BASE_REEVALUATION_REQUIRED".into()); }
    require_object(connection,(&row.0,&row.1))
}

fn require_object(connection: &Connection, identity: (&str,&str)) -> Result<(),String> {
    let bytes: Vec<u8> = super::data::sql(connection.query_row("SELECT bytes FROM protocol_gqwf_objects WHERE store_id=$1 AND hash=$2",
        params![identity.0,identity.1],|row|row.get(0)))?;
    if raw_hash(&bytes) != identity.1 { return Err("LLM_OMEGA_BASE_OBJECT_CORRUPT".into()); }
    Ok(())
}
