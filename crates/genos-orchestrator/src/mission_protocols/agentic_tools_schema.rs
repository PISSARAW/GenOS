use super::super::agentic_spec::{AgentConfig,ToolKind};
use genos_api::native_inference::ToolDefinition;
use serde_json::{Value,json};

pub fn definitions(agent:&AgentConfig)->Vec<ToolDefinition> {
    agent.tools.iter().map(|kind| definition(*kind,agent)).collect()
}

fn definition(kind:ToolKind,agent:&AgentConfig)->ToolDefinition {
    let (description,properties,required)=match kind {
        ToolKind::ReadSource=>("Lire un document du snapshot explicitement admis.",
            json!({"path":{"type":"string","minLength":1,"maxLength":1024}}),vec!["path"]),
        ToolKind::ListSources=>("Lister uniquement les documents du snapshot admis.",json!({}),vec![]),
        ToolKind::WriteArtifact=>("Créer un artefact texte immuable dans le CAS privé de cet agent, sans écraser le workspace.",
            artifact_properties(agent),vec!["name","text"]),
        ToolKind::ReadArtifact=>("Lire un artefact privé de soi-même ou d'un prédécesseur autorisé.",
            json!({"agent_id":{"type":"string","minLength":1,"maxLength":64},
                "name":{"type":"string","minLength":1,"maxLength":64}}),vec!["agent_id","name"]),
    };
    ToolDefinition { name:kind.as_str().into(),description:description.into(),parameters:json!({"type":"object",
        "properties":properties,"required":required,"additionalProperties":false}) }
}

fn artifact_properties(agent:&AgentConfig)->Value {
    let mut name=json!({"type":"string","minLength":1,"maxLength":64});
    if !agent.artifact_names.is_empty() { name["enum"]=json!(agent.artifact_names); }
    json!({"name":name,"text":{"type":"string","maxLength":65536}})
}
