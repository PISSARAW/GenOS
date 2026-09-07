use std::fs;
use std::path::Path;
use serde_json::json;

pub fn handle_experiment_causal(input_file: &str) -> Result<(), String> {
    let url = std::env::var("GENOS_API_URL").unwrap_or_else(|_| "http://127.0.0.1:4000".to_string());
    let client = reqwest::blocking::Client::new();
    let body = json!({
        "title": format!("Causal Replay: {}", input_file),
        "type": "chaos_simulation",
        "chaosLevel": 0
    });
    let res = client.post(&format!("{}/api/experiments", url))
        .json(&body)
        .send()
        .map_err(|e| format!("API Connection Error: {}", e))?;
    
    if res.status().is_success() {
        println!("{}", res.text().unwrap_or_default());
        Ok(())
    } else {
        Err(format!("API Error: {}", res.status()))
    }
}

pub fn handle_experiment_incident(manifest: &str) -> Result<(), String> {
    let manifest_val: serde_json::Value = if Path::new(manifest).exists() {
        let content = fs::read_to_string(manifest)
            .map_err(|e| format!("Impossible de lire le fichier manifeste '{}': {}", manifest, e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Contenu JSON invalide dans le fichier manifeste '{}': {}", manifest, e))?
    } else {
        serde_json::from_str(manifest)
            .map_err(|e| format!("Manifeste introuvable ou JSON invalide '{}': {}", manifest, e))?
    };

    if !manifest_val.is_object() || manifest_val.as_object().map_or(true, |o| o.is_empty()) {
        return Err(format!("Le manifeste '{}' doit être un objet JSON valide et non vide", manifest));
    }

    let url = std::env::var("GENOS_API_URL").unwrap_or_else(|_| "http://127.0.0.1:4000".to_string());
    let client = reqwest::blocking::Client::new();
    let body = json!({
        "title": "Incident Root Cause Analysis",
        "type": "incident_experiment",
        "chaosLevel": 50
    });
    let res = client.post(&format!("{}/api/experiments", url))
        .json(&body)
        .send()
        .map_err(|e| format!("API Connection Error: {}", e))?;
    
    if res.status().is_success() {
        println!("{}", res.text().unwrap_or_default());
        Ok(())
    } else {
        Err(format!("API Error: {}", res.status()))
    }
}

pub fn handle_experiment_bug(manifest: &str) -> Result<(), String> {
    let manifest_val: serde_json::Value = if Path::new(manifest).exists() {
        let content = fs::read_to_string(manifest)
            .map_err(|e| format!("Impossible de lire le fichier manifeste '{}': {}", manifest, e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Contenu JSON invalide dans le fichier manifeste '{}': {}", manifest, e))?
    } else {
        serde_json::from_str(manifest)
            .map_err(|e| format!("Manifeste introuvable ou JSON invalide '{}': {}", manifest, e))?
    };

    if !manifest_val.is_object() || manifest_val.as_object().map_or(true, |o| o.is_empty()) {
        return Err(format!("Le manifeste '{}' doit être un objet JSON valide et non vide", manifest));
    }

    let url = std::env::var("GENOS_API_URL").unwrap_or_else(|_| "http://127.0.0.1:4000".to_string());
    let client = reqwest::blocking::Client::new();
    let body = json!({
        "title": "Bug Reproduction and Falsification",
        "type": "scientific_experiment",
        "chaosLevel": 20
    });
    let res = client.post(&format!("{}/api/experiments", url))
        .json(&body)
        .send()
        .map_err(|e| format!("API Connection Error: {}", e))?;
    
    if res.status().is_success() {
        println!("{}", res.text().unwrap_or_default());
        Ok(())
    } else {
        Err(format!("API Error: {}", res.status()))
    }
}
