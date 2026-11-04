use genos_orchestrator::mission_protocols::{agentic_engine::NativeAgenticRequest,agentic_spec::AgenticSpec,
    agentic_source,llm_source,process,source};
use serde_json::{Value,json};
use std::path::PathBuf;
#[path="hierarchical_agentic_provider.rs"] mod transport;
pub use transport::{Mode,Provider};

pub const FINAL:&str="Sources : mid-left-result et mid-right-result. Limites : contrat structurel seulement.";

pub struct Fixture {
    pub root:tempfile::TempDir,pub workspace:PathBuf,pub config_path:PathBuf,pub database:PathBuf,
    pub provider:Provider,pub spec:AgenticSpec,executable:PathBuf,
}

impl Fixture {
    pub fn new(mode:Mode) -> Self {
        let root=tempfile::TempDir::new().unwrap();
        let workspace=root.path().join("workspace");std::fs::create_dir(&workspace).unwrap();
        let provider=Provider::start(mode);
        std::fs::write(workspace.join("notes.txt"),"Admitted source: transport alone is not proof.").unwrap();
        let config_path=workspace.join("agentic.json");
        std::fs::write(&config_path,serde_json::to_vec(&configuration(&provider)).unwrap()).unwrap();
        let executable=std::env::current_exe().unwrap();
        let bundle=agentic_source::read(&workspace,"agentic.json").unwrap();
        let spec=bundle.specification(llm_source::MissionIdentity { mission_id:uuid::Uuid::new_v4().to_string(),
            workspace:workspace.clone(),mission:"Delegate a hierarchy and combine returned source findings".into(),
            timeout_ms:600000,env_hash:process::executable_hash(&executable).unwrap() }).unwrap();
        let database=source::journal_path(&workspace).unwrap();
        Self { root,workspace,config_path,database,provider,spec,executable }
    }
    pub fn request(&self) -> NativeAgenticRequest {
        NativeAgenticRequest { spec:self.spec.clone(),executable:self.executable.clone(),database:self.database.clone() }
    }
    pub fn arm_registration_abort(&self) { self.provider.arm_registration_abort(self.database.clone()); }
    pub fn allow_registration(&self) {
        rusqlite::Connection::open(&self.database).unwrap().execute_batch("DROP TRIGGER abort_hierarchical_registration").unwrap();
    }
    pub fn connection(&self) -> rusqlite::Connection {
        rusqlite::Connection::open_with_flags(&self.database,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap()
    }
}

fn configuration(provider:&Provider) -> Value {
    json!({"schema":"genos.rust-agentic-config/v1","provider":{"kind":"ollama","address":provider.endpoint(),
        "model":"hierarchical-http-fixture","generation":1},"generation":{"max_output_tokens":256,"temperature_milli":0},
        "max_parallel_agents":2,"agents":[leaf("leaf_right"),leaf("idle"),leaf("leaf_left"),middle("mid_right"),middle("mid_left"),
            {"id":"root","instruction":"Delegate both intermediate roles and combine their received summaries","depends_on":[],
                "tools":["delegate_task","read_artifact","write_artifact"],"artifact_names":["final"],"max_turns":6}],
        "orchestration":{"coordinator":"root","max_delegations":5,
            "hierarchy":{"parents":{"mid_left":"root","mid_right":"root","leaf_left":"mid_left",
                "leaf_right":"mid_right","idle":"mid_left"},"max_depth":2,"max_children":2}},
        "documents":["notes.txt"],"contract":{"min_bytes":1,"max_bytes":4096,"required":["Sources","Limites"],
            "forbidden":[],"semantic_requirements":[]},
        "limits":{"tokens":200000,"model_calls":32,"tool_calls":32,"wall_ms":570000},
        "max_input_tokens":4096,"turn_timeout_ms":20000})
}

fn leaf(id:&str) -> Value {
    json!({"id":id,"instruction":"Execute only the assigned source task","tools":["read_source"],"max_turns":3})
}

fn middle(id:&str) -> Value {
    json!({"id":id,"instruction":"Delegate a source task, await its return, and write your summary",
        "tools":["delegate_task","write_artifact"],"artifact_names":["summary"],"max_turns":5})
}

pub fn agent_id(request:&Value) -> String {
    request["messages"].as_array().unwrap().iter().find_map(|message| {
        let value:Value=serde_json::from_str(message["content"].as_str()?).ok()?;
        value["own_agent_id"].as_str().map(str::to_owned)
    }).expect("actual model input agent identity missing")
}

pub fn model_input(request:&Value) -> Value {
    request["messages"].as_array().unwrap().iter().find_map(|message| {
        let value:Value=serde_json::from_str(message["content"].as_str()?).ok()?;
        (value["schema"]=="genos.rust-agentic-inputs/v1").then_some(value)
    }).expect("actual structured model input missing")
}
