use super::{Binding,Assignment,ReturnDelivery,data};
use super::super::{agentic_ledger,agentic_exchange,digest};
use rusqlite::{Connection,Transaction};

pub(super) fn completed(conn:&Connection,b:&Binding,a:&Assignment)->Result<agentic_ledger::CompletedAgent,String> {
    agentic_ledger::completed_in(conn,b,&a.worker_id)?.ok_or("AGENTIC_DELEGATION_RESULT_PENDING".into())
}
fn expected(b:&Binding,a:&Assignment,packet:&agentic_exchange::ReceivedData)->Result<ReturnDelivery,String> {
    let mut value=ReturnDelivery {binding_hash:digest(b)?,worker_id:a.worker_id.clone(),coordinator_id:a.parent.agent_id.clone(),
        assignment_hash:a.assignment_hash.clone(),return_turn:a.parent.turn.checked_add(1).ok_or("AGENTIC_RETURN_TURN_OVERFLOW")?,
        completion_hash:packet.result.completion_hash.clone(),packet_hash:packet.payload_hash.clone(),
        packet_receipt_hash:packet.receipt_hash.clone(),receipt_hash:String::new()};
    value.receipt_hash=digest(&("genos.agentic.delegation-return/v1",&value))?;Ok(value)
}
pub(super) fn deliver(tx:&Transaction<'_>,b:&Binding,a:&Assignment)->Result<(),String> {
    data::ensure(tx)?;
    if data::returned(tx,b,&a.worker_id)?.is_some() { require(tx,b,a)?;return Ok(()); }
    completed(tx,b,a)?;
    agentic_exchange::receive_one(tx,b,(&a.worker_id,&a.parent.agent_id))?;
    let packet=agentic_exchange::validate_delivery(tx,b,(&a.worker_id,&a.parent.agent_id))?;
    let value=expected(b,a,&packet)?;
    data::save_return(tx,b,&value)
}
pub(super) fn require(conn:&Connection,b:&Binding,a:&Assignment)->Result<(ReturnDelivery,agentic_exchange::ReceivedData),String> {
    let packet=agentic_exchange::validate_delivery(conn,b,(&a.worker_id,&a.parent.agent_id))?;
    let stored=data::returned(conn,b,&a.worker_id)?.ok_or("AGENTIC_DELEGATION_RETURN_NOT_DELIVERED")?;
    if stored!=expected(b,a,&packet)? { return Err("AGENTIC_DELEGATION_RETURN_CHANGED".into()); }
    data::event(conn,b,("AGENTIC_DELEGATION_RETURNED",&stored))?;Ok((stored,packet))
}
