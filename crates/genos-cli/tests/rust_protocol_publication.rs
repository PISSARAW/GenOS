use genos_orchestrator::mission_protocols::{Binding, RunSpec, Store, WorkerJob, WorkerRole, digest, raw_hash};
use genos_orchestrator::mission_protocols::{allostasis, evidence, gqwf, omega, process, synapse};
use rusqlite::{Connection, params};
use tempfile::TempDir;

struct Prepared {
    directory: TempDir, store: Store, binding: Binding, base: gqwf::Head,
    proof: process::ProcessEvidence, source: Vec<u8>,
}

impl Prepared {
    fn real_processes() -> Self {
        let directory = TempDir::new().unwrap();
        std::fs::write(directory.path().join("numbers.json"), b"[7,-2,3]").unwrap();
        let source = std::fs::read(directory.path().join("numbers.json")).unwrap();
        let executable = std::path::Path::new(env!("CARGO_BIN_EXE_genos"));
        let mut store = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
        let binding = store.admit(&RunSpec { mission_id: uuid::Uuid::new_v4().to_string(),
            workspace: directory.path().into(), objective: "publication CAS avec preuves processus réelles".into(),
            input_path: "numbers.json".into(), expected_sum: Some(8), timeout_ms: 180000,
            env_hash: process::executable_hash(executable).unwrap() }).unwrap();
        let base = gqwf::initialize(&mut store, &binding).unwrap();
        let proof = compute(&mut store, &binding, (&base, &source));
        evidence::accept(&mut store, &binding, &proof).unwrap();
        Self { directory, store, binding, base, proof, source }
    }

    fn context(&self) -> String {
        gqwf::context_hash(&self.binding, &gqwf::Context { base: self.base.clone(),
            source_hash: raw_hash(&self.source), input_hash: digest(&vec![7i64,-2,3]).unwrap() }).unwrap()
    }

    fn prepare(&mut self, id: &str) -> gqwf::Candidate {
        let candidate = gqwf::offer(&mut self.store, &self.binding, gqwf::Offer { candidate_id: id,
            producer: self.proof.receipts()[0], base: self.base.clone(), input_hash: digest(&vec![7i64,-2,3]).unwrap() }).unwrap();
        gqwf::receive(&mut self.store, &self.binding, id).unwrap();
        gqwf::verify(&mut self.store, &self.binding, gqwf::Verification { candidate_id: id, evidence: &self.proof }).unwrap();
        gqwf::prepare(&mut self.store, &self.binding, id).unwrap();
        candidate
    }

    fn emit_intent(&mut self) {
        let request = omega::Request { operation_id: "emit".into(), kind: omega::Kind::EmitCas,
            source_hash: raw_hash(&self.source), base_hash: self.base.root_hash.clone(), context_hash: self.context() };
        assert!(omega::request(&mut self.store, &self.binding, request).unwrap().new_dispatch_authorized);
    }

    fn connection(&self) -> Connection { Connection::open(self.directory.path().join("protocols.sqlite")).unwrap() }

    fn commit(&mut self, id: &str) -> Result<gqwf::Publication, String> {
        gqwf::commit(&mut self.store, &self.binding, gqwf::Commit { candidate_id: id, omega_operation_id: "emit" })
    }
}

fn compute(store: &mut Store, binding: &Binding, input: (&gqwf::Head, &[u8])) -> process::ProcessEvidence {
    let (base, bytes) = input;
    let roster = store.ensure_roster(binding).unwrap();
    let allocation = allostasis::reserve(store, binding, allostasis::Limits { process_slots: 3, wall_ms: 180000 }).unwrap();
    let context = gqwf::context_hash(binding, &gqwf::Context { base: base.clone(),
        source_hash: raw_hash(bytes), input_hash: digest(&vec![7i64,-2,3]).unwrap() }).unwrap();
    for role in [WorkerRole::Producer, WorkerRole::VerifierA, WorkerRole::VerifierB] {
        synapse::apply(store, binding, &synapse::ContextInput { source_hash: raw_hash(bytes), input: vec![7,-2,3],
            role, base_generation: 0, world_hash: base.root_hash.clone(), world_generation: base.generation }).unwrap();
    }
    for (kind,id) in [(omega::Kind::Read,"read"),(omega::Kind::Select,"select")] {
        request(store, binding, (id,kind,bytes,base,&context));
        omega::record_data(store, binding, omega::Data { operation_id: id, source: bytes }).unwrap();
    }
    let receipts = [WorkerRole::Producer, WorkerRole::VerifierA, WorkerRole::VerifierB].map(|role| {
        let kind = if role == WorkerRole::Producer { omega::Kind::CallIntegerSum } else { omega::Kind::CheckIndependent };
        request(store, binding, (role.as_str(),kind,bytes,base,&context));
        let job = WorkerJob { schema: "genos.rust-worker-job/v1".into(), binding_digest: digest(binding).unwrap(),
            operation_id: role.as_str().into(), worker_id: roster.member(role.as_str()).unwrap().actor_id.clone(), role,
            nonce: uuid::Uuid::new_v4().to_string(), source_hash: raw_hash(bytes), context_hash: context.clone(),
            env_hash: binding.env_hash.clone(), policy_hash: binding.policy_hash.clone(), input: vec![7,-2,3] };
        let exposure = allostasis::expose(store, binding, allostasis::Exposure { allocation_id: &allocation.allocation_id,
            operation_id: role.as_str(), maximum_ms: 30000 }).unwrap();
        assert!(exposure.new_dispatch_authorized);
        observe(store, binding, &job)
    });
    process::ProcessEvidence::collect(binding, (receipts, Some(8))).unwrap()
}

fn request(store: &mut Store, binding: &Binding, input: (&str,omega::Kind,&[u8],&gqwf::Head,&str)) {
    let intent = omega::request(store, binding, omega::Request { operation_id: input.0.into(), kind: input.1,
        source_hash: raw_hash(input.2), base_hash: input.3.root_hash.clone(), context_hash: input.4.into() }).unwrap();
    assert!(intent.new_dispatch_authorized);
}

fn observe(store: &mut Store, binding: &Binding, job: &WorkerJob) -> process::ProcessReceipt {
    let receipt = process::execute(binding, process::Launch {
        executable: std::path::Path::new(env!("CARGO_BIN_EXE_genos")), job, maximum_ms: 30000 }).unwrap();
    allostasis::settle(store, binding, &receipt).unwrap();
    omega::observe(store, binding, &receipt).unwrap();
    receipt
}

fn assert_unpublished(fixture: &mut Prepared, id: &str) {
    assert_eq!(gqwf::head(&mut fixture.store, &fixture.binding).unwrap(), fixture.base);
    let connection = fixture.connection();
    let status: String = connection.query_row("SELECT status FROM rust_protocol_runs WHERE run_id=$1",
        [&fixture.binding.run_id], |row| row.get(0)).unwrap();
    assert_eq!(status, "admitted");
    let state: (String,Option<String>) = connection.query_row("SELECT status,receipt_json FROM protocol_gqwf_candidates
        WHERE candidate_id=$1", [id], |row| Ok((row.get(0)?,row.get(1)?))).unwrap();
    assert_eq!(state, ("prepared".into(),None));
    let emit: (String,Option<String>) = connection.query_row("SELECT status,receipt_json FROM protocol_omega_operations
        WHERE operation_id='emit'", [], |row| Ok((row.get(0)?,row.get(1)?))).unwrap();
    assert_eq!(emit, ("intent".into(),None));
}

#[test]
fn receipt_failure_rolls_back_actual_head_cas_omega_receipt_and_run_completion() {
    let mut fixture = Prepared::real_processes();
    fixture.prepare("branch-a"); fixture.emit_intent();
    let connection = fixture.connection();
    connection.execute_batch("CREATE TRIGGER abort_publication BEFORE UPDATE OF receipt_json ON protocol_gqwf_candidates
        WHEN NEW.status='published' BEGIN SELECT RAISE(ABORT,'TEST_PUBLICATION_RECEIPT_ABORT'); END;").unwrap();
    assert!(fixture.commit("branch-a").unwrap_err().contains("TEST_PUBLICATION_RECEIPT_ABORT"));
    assert_unpublished(&mut fixture, "branch-a");
    connection.execute_batch("DROP TRIGGER abort_publication").unwrap();
    let publication = fixture.commit("branch-a").unwrap();
    assert_eq!(publication.generation, 1);
    assert_eq!(fixture.commit("branch-a").unwrap(), publication);
    assert_eq!(fixture.commit("branch-a").unwrap(), publication);
    let observations: u64 = connection.query_row("SELECT observed_processes FROM protocol_allostasis_pools",
        [], |row| row.get(0)).unwrap();
    assert_eq!(observations, 3);
    assert_eq!(gqwf::result_bytes(&mut fixture.store, &fixture.binding, "branch-a").unwrap(), fixture.proof.receipts()[0].output());
}

#[test]
fn two_real_prepared_candidates_share_one_head_generation_winner() {
    let mut fixture = Prepared::real_processes();
    fixture.prepare("branch-a"); fixture.prepare("branch-b"); fixture.emit_intent();
    let first = fixture.commit("branch-a").unwrap();
    assert!(fixture.commit("branch-b").unwrap_err().contains("BASE_REEVALUATION"));
    assert_eq!(fixture.commit("branch-a").unwrap(), first);
    assert_eq!(gqwf::head(&mut fixture.store, &fixture.binding).unwrap().generation, 1);
    let publications: u64 = fixture.connection().query_row("SELECT COUNT(*) FROM protocol_gqwf_candidates WHERE status='published'",
        [], |row| row.get(0)).unwrap();
    assert_eq!(publications, 1);
}

#[test]
fn raw_input_is_received_in_cas_and_corruption_cannot_be_promoted() {
    let mut fixture = Prepared::real_processes();
    let candidate = fixture.prepare("branch-a"); fixture.emit_intent();
    let connection = fixture.connection();
    let copies: u64 = connection.query_row("SELECT COUNT(*) FROM protocol_gqwf_objects WHERE hash=$1",
        [&candidate.source_hash], |row| row.get(0)).unwrap();
    assert_eq!(copies, 2);
    connection.execute("UPDATE protocol_gqwf_objects SET bytes=$1 WHERE store_id=$2 AND hash=$3",
        params![b"[7,-2,4]".as_slice(),candidate.receiver_store,candidate.source_hash]).unwrap();
    assert!(fixture.commit("branch-a").unwrap_err().contains("OBJECT_CORRUPT"));
    assert_unpublished(&mut fixture, "branch-a");
}
