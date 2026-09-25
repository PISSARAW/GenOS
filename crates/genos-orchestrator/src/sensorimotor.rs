//! Pont vers le crate sensorimoteur : capture d'écran, souris, clavier.
//!
//! Les fonctions sont exposées mais volontairement non exécutées par les tests
//! (elles pilotent le bureau de la machine hôte).

pub use genos_sensorimotor::{ActionStep, capture_screen_base64, execute_action, execute_actions};

/// Capture l'écran et renvoie `(png_base64, largeur, hauteur)`.
pub fn capture_screen() -> Result<(String, u32, u32), String> {
    capture_screen_base64()
}

/// Exécute une suite d'actions sur le bureau (souris / clavier).
pub fn run_actions(steps: &[ActionStep]) -> Result<(), String> {
    execute_actions(steps)
}
