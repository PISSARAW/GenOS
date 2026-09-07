use base64::{engine::general_purpose, Engine as _};
use enigo::{Enigo, Mouse, Keyboard, Settings, Coordinate, Direction, Key, Button};
use xcap::Monitor;
use serde::Deserialize;
use std::thread;
use std::time::Duration;

pub fn capture_screen_base64() -> Result<(String, u32, u32), String> {
    let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;
    let monitor = monitors.into_iter().next().ok_or_else(|| "No monitor found".to_string())?;
    
    let image = monitor.capture_image().map_err(|e| format!("Failed to capture image: {}", e))?;
    let width = image.width();
    let height = image.height();
    
    // Save to memory buffer as PNG
    let mut buffer = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buffer);
    image.write_to(&mut cursor, image::ImageFormat::Png).map_err(|e| format!("Failed to encode image: {}", e))?;
    
    Ok((general_purpose::STANDARD.encode(&buffer), width, height))
}

#[derive(Deserialize, Debug)]
pub struct ActionStep {
    #[serde(rename = "type")]
    pub action: String,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub text: Option<String>,
    pub button: Option<String>,
}

pub fn execute_action(
    action: &str,
    x: Option<i32>,
    y: Option<i32>,
    text: Option<&str>,
    button: Option<&str>,
) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init Enigo: {:?}", e))?;
    execute_action_with(&mut enigo, action, x, y, text, button)
}

/// Execute a batch of actions back-to-back with a single Enigo session, so a
/// multi-step plan (e.g. open the Run dialog, type a command, press Enter) runs
/// in one process without the overhead of spawning the CLI per step or
/// re-capturing the screen between each one. Stops at the first failing step
/// and reports its index.
pub fn execute_actions(steps: &[ActionStep]) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init Enigo: {:?}", e))?;
    for (i, step) in steps.iter().enumerate() {
        execute_action_with(&mut enigo, &step.action, step.x, step.y, step.text.as_deref(), step.button.as_deref())
            .map_err(|e| format!("Step {} ({}) failed: {}", i, step.action, e))?;
    }
    Ok(())
}

fn execute_action_with(
    enigo: &mut Enigo,
    action: &str,
    x: Option<i32>,
    y: Option<i32>,
    text: Option<&str>,
    button: Option<&str>,
) -> Result<(), String> {
    match action {
        "mouse_move" => {
            if let (Some(x_pos), Some(y_pos)) = (x, y) {
                enigo.move_mouse(x_pos, y_pos, Coordinate::Abs).map_err(|e| format!("Mouse error: {:?}", e))?;
                thread::sleep(Duration::from_millis(50));
            } else {
                return Err("mouse_move requires x and y".to_string());
            }
        }
        "click" => {
            if let (Some(x_pos), Some(y_pos)) = (x, y) {
                enigo.move_mouse(x_pos, y_pos, Coordinate::Abs).map_err(|e| format!("Mouse error: {:?}", e))?;
                thread::sleep(Duration::from_millis(50));
            }
            let btn = match button.unwrap_or("left") {
                "right" => Button::Right,
                "middle" => Button::Middle,
                _ => Button::Left,
            };
            enigo.button(btn, Direction::Click).map_err(|e| format!("Click error: {:?}", e))?;
        }
        "type" => {
            if let Some(t) = text {
                enigo.text(t).map_err(|e| format!("Type error: {:?}", e))?;
            } else {
                return Err("type requires text".to_string());
            }
        }
        "key" => {
            if let Some(k) = text {
                let key = match k.to_lowercase().as_str() {
                    "enter" | "return" => Key::Return,
                    "esc" | "escape" => Key::Escape,
                    "tab" => Key::Tab,
                    "backspace" => Key::Backspace,
                    "space" => Key::Space,
                    "super" | "windows" | "win" | "meta" => Key::Meta,
                    _ => return Err(format!("Unsupported key: {}", k)),
                };
                enigo.key(key, Direction::Click).map_err(|e| format!("Key error: {:?}", e))?;
            } else {
                return Err("key action requires text parameter for the key name".to_string());
            }
        }
        _ => return Err(format!("Unknown desktop action: {}", action)),
    }
    
    Ok(())
}

