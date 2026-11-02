//! Le chemin natif : aucun pont Node et aucun endpoint d'exécution fourni par la mission.
use super::{Binding, Computation, RunSpec, Store, WorkerJob, WorkerRole, digest};
use super::{allostasis, evidence, gqwf, omega, process, source, synapse};
use super::morph_types::Roster;
use rusqlite::OptionalExtension;
use serde::Serialize;
use std::path::PathBuf;

pub struct NativeRequest {
    pub spec: RunSpec,
    pub executable: PathBuf,
    pub database: PathBuf,
}

#[derive(Serialize)]
pub struct NativeReport {
    pub schema: &'static str,
    pub status: &'static str,
    pub verified: bool,
    pub binding: Binding,
    pub result: Computation,
    pub publication: gqwf::Publication,
    pub usage: allostasis::State,
    pub replayed: bool,
    pub protocols: Vec<String>,
}

struct Session {
    store: Store, binding: Binding, spec: RunSpec, executable: PathBuf,
    source: source::Source, fresh: bool,
}

struct Prepared {
    base: gqwf::Head,
    allocation: allostasis::Allocation,
    roster: Roster,
}

pub fn run(request: NativeRequest) -> Result<NativeReport,String> {
    let mut session=Session::open(request)?;
    let outcome=if session.fresh { session.execute() } else { session.replay() };
    if let Err(error)=&outcome { session.record_stop(error)?; }
    outcome
}

impl Session {
    fn record_stop(&mut self, error: &str) -> Result<(),String> {
        self.store.observation_transaction(&self.binding,|tx| {
            tx.execute("UPDATE rust_protocol_runs SET status='blocked' WHERE run_id=?1 AND status!='completed'",
                [&self.binding.run_id]).map_err(|e|e.to_string())?;
            Store::event(tx,&self.binding,super::Event { protocol:"RUNTIME",phase:"STOPPED_WITHOUT_NEW_ACCEPTANCE",
                payload:serde_json::json!({"reason":error,"unknown_exposure_retained":true}) })
        })
    }
    fn open(request: NativeRequest) -> Result<Self,String> {
        if process::executable_hash(&request.executable)? != request.spec.env_hash {
            return Err("native executable changed before admission".into());
        }
        let source=source::read(&request.spec)?;
        let mut store=Store::open(&request.database)?;
        let existing=existing_binding(&store,&request.spec.mission_id)?;
        let fresh=existing.is_none();
        let binding=match existing { Some(binding)=>binding, None=>store.admit(&request.spec)? };
        if binding.request_hash!=digest(&request.spec)? { return Err("native mission request changed".into()); }
        store.current(&binding)?;
        Ok(Self { store,binding,spec:request.spec,executable:request.executable,source,fresh })
    }

    fn execute(&mut self) -> Result<NativeReport,String> {
        let prepared=self.prepare()?;
        let receipts=self.compute(&prepared)?;
        let proof=process::ProcessEvidence::collect(&self.binding,(receipts,self.spec.expected_sum))?;
        evidence::accept(&mut self.store,&self.binding,&proof)?;
        let publication=self.publish(&prepared,&proof)?;
        allostasis::release(&mut self.store,&self.binding,&prepared.allocation.allocation_id)?;
        self.report(publication,false)
    }

    fn prepare(&mut self) -> Result<Prepared,String> {
        let base=gqwf::initialize(&mut self.store,&self.binding)?;
        let roster=self.store.ensure_roster(&self.binding)?;
        let allocation=allostasis::reserve(&mut self.store,&self.binding,
            allostasis::Limits { process_slots:3,wall_ms:self.spec.timeout_ms })?;
        self.contexts(&base)?;
        let prepared=Prepared { base,roster,allocation };
        self.read_select(&prepared)?;
        self.store.checkpoint(&self.binding,&serde_json::json!({"phase":"native-dispatch-ready",
            "source_hash":self.source.hash,"roster":prepared.roster}))?;
        Ok(prepared)
    }

    fn contexts(&mut self,base: &gqwf::Head) -> Result<(),String> {
        for role in [WorkerRole::Producer,WorkerRole::VerifierA,WorkerRole::VerifierB] {
            synapse::apply(&mut self.store,&self.binding,&synapse::ContextInput {
                source_hash:self.source.hash.clone(),input:self.source.input.clone(),role,base_generation:0,
                world_hash:base.root_hash.clone(),world_generation:base.generation })?;
        }
        Ok(())
    }

    fn request(&mut self,prepared: &Prepared,op: (&str,omega::Kind)) -> Result<(),String> {
        let context=gqwf::context_hash(&self.binding,&gqwf::Context { base:prepared.base.clone(),
            source_hash:self.source.hash.clone(),input_hash:digest(&self.source.input)? })?;
        let intent=omega::request(&mut self.store,&self.binding,omega::Request {
            operation_id:op.0.into(),kind:op.1,source_hash:self.source.hash.clone(),
            base_hash:prepared.base.root_hash.clone(),context_hash:context })?;
        if !intent.new_dispatch_authorized { return Err("native operation already observed or outcome unknown".into()); }
        Ok(())
    }

    fn read_select(&mut self,prepared: &Prepared) -> Result<(),String> {
        for (id,kind) in [("read",omega::Kind::Read),("select",omega::Kind::Select)] {
            self.request(prepared,(id,kind))?;
            let current=source::read(&self.spec)?;
            if current.hash!=self.source.hash { return Err("native source changed after preparation".into()); }
            omega::record_data(&mut self.store,&self.binding,omega::Data { operation_id:id,source:&current.bytes })?;
        }
        Ok(())
    }

    fn compute(&mut self,prepared: &Prepared) -> Result<[process::ProcessReceipt;3],String> {
        let a=self.worker(prepared,WorkerRole::Producer)?;
        let b=self.worker(prepared,WorkerRole::VerifierA)?;
        let c=self.worker(prepared,WorkerRole::VerifierB)?;
        Ok([a,b,c])
    }

    fn worker(&mut self,prepared: &Prepared,role: WorkerRole) -> Result<process::ProcessReceipt,String> {
        let kind=if role==WorkerRole::Producer { omega::Kind::CallIntegerSum } else { omega::Kind::CheckIndependent };
        self.request(prepared,(role.as_str(),kind))?;
        let job=self.job(prepared,role)?;
        let maximum_ms=(self.spec.timeout_ms-self.spec.timeout_ms.div_ceil(20))/3;
        self.expose(prepared,(&job,maximum_ms))?;
        self.launch(&job,maximum_ms)
    }

    fn job(&mut self,prepared: &Prepared,role: WorkerRole) -> Result<WorkerJob,String> {
        let roster=self.store.roster(&self.binding)?;
        if roster!=prepared.roster { return Err("native roster changed before dispatch".into()); }
        let context=synapse::read(&self.store,&self.binding,role)?;
        Ok(WorkerJob { schema:"genos.rust-worker-job/v1".into(),binding_digest:digest(&self.binding)?,
            operation_id:role.as_str().into(),worker_id:roster.member(role.as_str())?.actor_id.clone(),role,
            nonce:uuid::Uuid::new_v4().to_string(),source_hash:context.source_hash,context_hash:context.context_hash,
            env_hash:self.binding.env_hash.clone(),policy_hash:self.binding.policy_hash.clone(),input:context.input })
    }

    fn expose(&mut self,prepared: &Prepared,values: (&WorkerJob,u64)) -> Result<(),String> {
        let (job,maximum_ms)=values;
        self.store.current(&self.binding)?;
        let exposure=allostasis::expose(&mut self.store,&self.binding,allostasis::Exposure {
            allocation_id:&prepared.allocation.allocation_id,operation_id:&job.operation_id,maximum_ms })?;
        if !exposure.new_dispatch_authorized { return Err("native exposure cannot be dispatched again".into()); }
        self.store.current(&self.binding)
    }

    fn launch(&mut self,job: &WorkerJob,maximum_ms:u64) -> Result<process::ProcessReceipt,String> {
        let observed=process::execute(&self.binding,process::Launch { executable:&self.executable,job,maximum_ms });
        let receipt=match observed {
            Ok(receipt)=>receipt,
            Err(error)=> { allostasis::unknown(&mut self.store,&self.binding,&job.operation_id)?; return Err(error); }
        };
        allostasis::settle(&mut self.store,&self.binding,&receipt)?;
        receipt.assert_binding(&self.binding)?;
        omega::observe(&mut self.store,&self.binding,&receipt)?;
        Ok(receipt)
    }

    fn publish(&mut self,prepared: &Prepared,proof: &process::ProcessEvidence) -> Result<gqwf::Publication,String> {
        let current=source::read(&self.spec)?;
        if current.hash!=proof.source_hash() { return Err("native source changed before publication".into()); }
        self.offer(prepared,proof)?;
        self.request(prepared,("emit",omega::Kind::EmitCas))?;
        gqwf::commit(&mut self.store,&self.binding,gqwf::Commit { candidate_id:"result",omega_operation_id:"emit" })
    }

    fn offer(&mut self,prepared: &Prepared,proof: &process::ProcessEvidence) -> Result<(),String> {
        gqwf::offer(&mut self.store,&self.binding,gqwf::Offer { candidate_id:"result",producer:proof.receipts()[0],
            base:prepared.base.clone(),input_hash:digest(&self.source.input)? })?;
        gqwf::receive(&mut self.store,&self.binding,"result")?;
        gqwf::verify(&mut self.store,&self.binding,gqwf::Verification { candidate_id:"result",evidence:proof })?;
        gqwf::prepare(&mut self.store,&self.binding,"result")?;
        Ok(())
    }

    fn replay(&mut self) -> Result<NativeReport,String> {
        let publication=gqwf::publication(&mut self.store,&self.binding,"result")?
            .ok_or("NATIVE_MISSION_OUTCOME_PENDING: automatic redispatch is forbidden")?;
        let allocation=allostasis::reserve(&mut self.store,&self.binding,
            allostasis::Limits { process_slots:3,wall_ms:self.spec.timeout_ms })?;
        allostasis::release(&mut self.store,&self.binding,&allocation.allocation_id)?;
        self.report(publication,true)
    }

    fn report(&mut self,publication:gqwf::Publication,replayed:bool) -> Result<NativeReport,String> {
        let bytes=gqwf::result_bytes(&mut self.store,&self.binding,"result")?;
        let result:Computation=serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if result.source_hash!=self.source.hash { return Err("published source is no longer current".into()); }
        let usage=allostasis::state(&mut self.store,&self.binding)?;
        let protocols=protocol_names(&self.store,&self.binding)?;
        Ok(NativeReport { schema:"genos.rust-native-mission/v1",status:"completed",verified:true,binding:self.binding.clone(),
            result,publication,usage,replayed,protocols })
    }
}

fn existing_binding(store:&Store,mission:&str) -> Result<Option<Binding>,String> {
    let row:Option<String>=store.connection.query_row("SELECT r.binding_json FROM rust_protocol_runs r
        JOIN rust_protocol_current c ON c.run_id=r.run_id WHERE c.mission_id=?1",[mission],|r| r.get(0))
        .optional().map_err(|e| e.to_string())?;
    row.map(|s|serde_json::from_str(&s).map_err(|e| e.to_string())).transpose()
}

fn protocol_names(store:&Store,binding:&Binding) -> Result<Vec<String>,String> {
    let mut statement=store.connection.prepare("SELECT DISTINCT protocol FROM rust_protocol_events WHERE run_id=?1 ORDER BY protocol")
        .map_err(|e| e.to_string())?;
    let names=statement.query_map([&binding.run_id],|r|r.get(0)).map_err(|e| e.to_string())?;
    names.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}
