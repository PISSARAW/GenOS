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
    arguments: (Option<i32>, Option<i32>, Option<&str>, Option<&str>),
) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init Enigo: {:?}", e))?;
    execute_action_with(&mut enigo, action, arguments)
}

/// Execute a batch of actions back-to-back with a single Enigo session, so a
/// multi-step plan (e.g. open the Run dialog, type a command, press Enter) runs
/// in one process without the overhead of spawning the CLI per step or
/// re-capturing the screen between each one. Stops at the first failing step
/// and reports its index.
pub fn execute_actions(steps: &[ActionStep]) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init Enigo: {:?}", e))?;
    for (i, step) in steps.iter().enumerate() {
        execute_action_with(&mut enigo, &step.action, (step.x, step.y, step.text.as_deref(), step.button.as_deref()))
            .map_err(|e| format!("Step {} ({}) failed: {}", i, step.action, e))?;
    }
    Ok(())
}

fn execute_action_with(
    enigo: &mut Enigo,
    action: &str,
    arguments: (Option<i32>, Option<i32>, Option<&str>, Option<&str>),
) -> Result<(), String> {
    let (x, y, text, button) = arguments;
    match action {
        "mouse_move" => move_pointer(enigo, x, y)?,
        "click" => click_pointer(enigo, (x, y), button)?,
        "type" => type_text(enigo, text)?,
        "key" => press_key(enigo, text)?,
        _ => return Err(format!("Unknown desktop action: {}", action)),
    }
    Ok(())
}

fn move_pointer(enigo: &mut Enigo, x: Option<i32>, y: Option<i32>) -> Result<(), String> {
    let (Some(x), Some(y)) = (x, y) else {
        return Err("mouse_move requires x and y".to_string());
    };
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| format!("Mouse error: {:?}", e))?;
    thread::sleep(Duration::from_millis(50));
    Ok(())
}

fn ui_click(x: Option<i32>, y: Option<i32>) -> bool {
    let (Some(x), Some(y)) = (x, y) else { return false; };
    let Ok(uia) = uiautomation::UIAutomation::new() else { return false; };
    let point = uiautomation::types::Point::new(x, y);
    let Ok(element) = uia.element_from_point(point) else { return false; };
    let _ = element.set_focus();
    use uiautomation::patterns::{UIInvokePattern, UITogglePattern, UISelectionItemPattern};
    if let Ok(invoke) = element.get_pattern::<UIInvokePattern>() {
        invoke.invoke().is_ok()
    } else if let Ok(toggle) = element.get_pattern::<UITogglePattern>() {
        toggle.toggle().is_ok()
    } else if let Ok(selection) = element.get_pattern::<UISelectionItemPattern>() {
        selection.select().is_ok()
    } else {
        true
    }
}

fn click_pointer(enigo: &mut Enigo, position: (Option<i32>, Option<i32>), button: Option<&str>) -> Result<(), String> {
    let (x, y) = position;
    if ui_click(x, y) { return Ok(()); }
    if let (Some(x), Some(y)) = (x, y) {
        enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| format!("Mouse error: {:?}", e))?;
        thread::sleep(Duration::from_millis(50));
    }
    let btn = match button.unwrap_or("left") {
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => Button::Left,
    };
    enigo.button(btn, Direction::Click).map_err(|e| format!("Click error: {:?}", e))
}

fn ui_type(text: &str) -> bool {
    let Ok(uia) = uiautomation::UIAutomation::new() else { return false; };
    let Ok(element) = uia.get_focused_element() else { return false; };
    use uiautomation::patterns::UIValuePattern;
    let Ok(value) = element.get_pattern::<UIValuePattern>() else { return false; };
    value.set_value(text).is_ok()
}

fn type_text(enigo: &mut Enigo, text: Option<&str>) -> Result<(), String> {
    let Some(text) = text else { return Err("type requires text".to_string()); };
    if !ui_type(text) {
        enigo.text(text).map_err(|e| format!("Type error: {:?}", e))?;
    }
    Ok(())
}

fn press_key(enigo: &mut Enigo, text: Option<&str>) -> Result<(), String> {
    let Some(text) = text else {
        return Err("key action requires text parameter for the key name".to_string());
    };
    let key = match text.to_lowercase().as_str() {
        "enter" | "return" => Key::Return,
        "esc" | "escape" => Key::Escape,
        "tab" => Key::Tab,
        "backspace" => Key::Backspace,
        "space" => Key::Space,
        "super" | "windows" | "win" | "meta" => Key::Meta,
        _ => return Err(format!("Unsupported key: {}", text)),
    };
    enigo.key(key, Direction::Click).map_err(|e| format!("Key error: {:?}", e))
}
