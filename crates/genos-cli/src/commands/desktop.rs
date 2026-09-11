use crate::args::DesktopSubcommands;
use genos_sensorimotor::{capture_screen_base64, execute_action, execute_actions, ActionStep};
use serde_json::json;
use super::output_guard::WriteOptions;
use super::output_guard::write_output_file;

fn print_capture_inline(found: &(String, u32, u32)) -> Result<(), String> {
    println!("{}", json!({ "success": true, "base64": found.0, "width": found.1, "height": found.2 }));
    Ok(())
}

fn write_capture_file(found: &(String, u32, u32), path: &str, opts: &WriteOptions) -> Result<(), String> {
    match write_output_file(path, &found.0, opts) {
        Ok(()) => {
            println!("{}", json!({ "success": true, "path": path, "width": found.1, "height": found.2 }));
            Ok(())
        }
        Err(reason) => Err(reason),
    }
}

fn persist_capture(found: (String, u32, u32), out: Option<&str>, opts: &WriteOptions) -> Result<(), String> {
    match out {
        Some(path) => write_capture_file(&found, path, opts),
        None => print_capture_inline(&found),
    }
}

fn report_capture_error(reason: String) -> Result<(), String> {
    println!("{}", json!({ "success": false, "error": reason }));
    Err(reason)
}

fn handle_capture(out: Option<&str>, force: bool, parents: bool) -> Result<(), String> {
    let opts = WriteOptions { force, parents };
    match capture_screen_base64() {
        Ok(found) => persist_capture(found, out, &opts),
        Err(reason) => report_capture_error(reason),
    }
}

pub fn execute(cmd: DesktopSubcommands) -> Result<(), String> {
    match cmd {
        DesktopSubcommands::Capture { out, force, parents } => handle_capture(out.as_deref(), force, parents),
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

