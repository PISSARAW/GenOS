use crate::args::DesktopSubcommands;
use genos_sensorimotor::{capture_screen_base64, execute_action, execute_actions, ActionStep};
use serde_json::json;

pub fn execute(cmd: DesktopSubcommands) -> Result<(), String> {
    match cmd {
        DesktopSubcommands::Capture { out } => {
            match capture_screen_base64() {
                Ok(b64) => {
                    if let Some(path) = out {
                        std::fs::write(&path, &b64).map_err(|e| format!("Failed to write base64: {}", e))?;
                        println!("{}", json!({ "success": true, "path": path }));
                    } else {
                        println!("{}", json!({ "success": true, "base64": b64 }));
                    }
                    Ok(())
                },
                Err(e) => {
                    println!("{}", json!({ "success": false, "error": e }));
                    Err(e)
                }
            }
        },
        DesktopSubcommands::Action { r#type, x, y, text, button } => {
            match execute_action(&r#type, x, y, text.as_deref(), button.as_deref()) {
                Ok(_) => {
                    println!("{}", json!({ "success": true }));
                    Ok(())
                },
                Err(e) => {
                    println!("{}", json!({ "success": false, "error": e }));
                    Err(e)
                }
            }
        },
        DesktopSubcommands::Actions { json: steps_json } => {
            let steps: Vec<ActionStep> = match serde_json::from_str(&steps_json) {
                Ok(s) => s,
                Err(e) => {
                    let msg = format!("Invalid actions JSON: {}", e);
                    println!("{}", json!({ "success": false, "error": msg }));
                    return Err(msg);
                }
            };
            match execute_actions(&steps) {
                Ok(_) => {
                    println!("{}", json!({ "success": true, "count": steps.len() }));
                    Ok(())
                },
                Err(e) => {
                    println!("{}", json!({ "success": false, "error": e }));
                    Err(e)
                }
            }
        }
    }
}

