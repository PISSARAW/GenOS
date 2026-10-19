use base64::{engine::general_purpose, Engine as _};
use enigo::{Enigo, Mouse, Keyboard, Settings, Coordinate, Direction, Key, Button};
#[cfg(any(target_os = "windows", target_os = "macos"))]
use xcap::Monitor;
use serde::Deserialize;
use std::thread;
use std::time::Duration;
use std::collections::BTreeMap;

#[cfg(any(target_os = "windows", target_os = "macos"))]
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

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn capture_screen_base64() -> Result<(String, u32, u32), String> {
    Err("screen capture is not available on this platform".to_string())
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

/// Numeric state variables that can be compared across a predicted interaction.
/// Screen capture currently contributes dimensions and encoded image size; it does
/// not claim OCR or semantic visual understanding.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StateObservation {
    pub metrics: BTreeMap<String, f64>,
}

#[derive(Clone, Debug)]
pub struct PredictionContract {
    pub expected: StateObservation,
    pub tolerance: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SensorimotorDiscrepancy {
    pub expected: StateObservation,
    pub observed: StateObservation,
    pub prediction_error: f64,
    pub compared_metrics: usize,
    pub within_tolerance: bool,
}

/// Execute one bounded desktop step, capture the resulting screen, and compare
/// registered numeric metrics against the prediction contract.
pub fn execute_predictive_step(
    contract: &PredictionContract,
    step: &ActionStep,
) -> Result<SensorimotorDiscrepancy, String> {
    execute_actions(std::slice::from_ref(step))?;
    let (image, width, height) = capture_screen_base64()?;
    let observed = StateObservation { metrics: BTreeMap::from([
        ("screen.width".to_string(), f64::from(width)),
        ("screen.height".to_string(), f64::from(height)),
        ("screen.png_base64_bytes".to_string(), image.len() as f64),
    ]) };
    compare_observations(contract, observed)
}

fn compare_observations(
    contract: &PredictionContract,
    observed: StateObservation,
) -> Result<SensorimotorDiscrepancy, String> {
    if !contract.tolerance.is_finite() || contract.tolerance < 0.0 {
        return Err("prediction tolerance must be finite and non-negative".to_string());
    }
    let errors: Vec<f64> = contract.expected.metrics.iter().filter_map(|(metric, expected)| {
        let actual = observed.metrics.get(metric)?;
        if !expected.is_finite() || !actual.is_finite() { return None; }
        Some((actual - expected).abs() / expected.abs().max(1.0))
    }).collect();
    if errors.is_empty() { return Err("prediction contract has no comparable captured metrics".to_string()); }
    let prediction_error = errors.iter().sum::<f64>() / errors.len() as f64;
    Ok(SensorimotorDiscrepancy { expected: contract.expected.clone(), observed,
        prediction_error, compared_metrics: errors.len(),
        within_tolerance: prediction_error <= contract.tolerance })
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

#[cfg(target_os = "windows")]
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

#[cfg(not(target_os = "windows"))]
fn ui_click(_x: Option<i32>, _y: Option<i32>) -> bool {
    false
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

#[cfg(target_os = "windows")]
fn ui_type(text: &str) -> bool {
    let Ok(uia) = uiautomation::UIAutomation::new() else { return false; };
    let Ok(element) = uia.get_focused_element() else { return false; };
    use uiautomation::patterns::UIValuePattern;
    let Ok(value) = element.get_pattern::<UIValuePattern>() else { return false; };
    value.set_value(text).is_ok()
}

#[cfg(not(target_os = "windows"))]
fn ui_type(_text: &str) -> bool {
    false
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

#[cfg(test)]
mod predictive_tests {
    use super::{compare_observations, PredictionContract, StateObservation};
    use std::collections::BTreeMap;

    #[test]
    fn computes_normalized_error_from_registered_metrics() {
        let expected = StateObservation { metrics: BTreeMap::from([
            ("screen.width".to_string(), 100.0),
        ]) };
        let contract = PredictionContract { expected: expected.clone(), tolerance: 0.1 };
        let observed = StateObservation { metrics: BTreeMap::from([
            ("screen.width".to_string(), 120.0),
        ]) };
        let discrepancy = compare_observations(&contract, observed).unwrap();
        assert_eq!(discrepancy.compared_metrics, 1);
        assert!((discrepancy.prediction_error - 0.2).abs() < f64::EPSILON);
        assert!(!discrepancy.within_tolerance);
    }

    #[test]
    fn rejects_contract_without_comparable_metrics() {
        let contract = PredictionContract { expected: StateObservation::default(), tolerance: 0.1 };
        assert!(compare_observations(&contract, StateObservation::default()).is_err());
    }
}
