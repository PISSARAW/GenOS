use serde::{Deserialize, Serialize};

/// Perspective / Protocole d'observation pour le rendu polymorphique
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ObserverPerspective {
    /// Rendu pour terminal TUI avec couleurs spectrales ANSI
    TuiAnsi,
    /// Rendu JSON structuré pour agents et machines
    StructuredJson,
    /// Rendu Markdown visuel pour humains
    MarkdownVisual,
    /// Camouflage déterministe par César, sans propriété cryptographique.
    CrypticCamouflage,
}

/// Réseau de nanocristaux de guanine (Plaquettes photoniques)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuaninePlateletLattice {
    /// Espacement interfacié $d$ entre les plaquettes en nanomètres (typiquement 120 à 250 nm)
    pub spacing_d_nm: f64,
    /// Indice de réfraction effectif du milieu $n_{\text{eff}}$ (~ 1.55)
    pub effective_refractive_index: f64,
    /// Angle d'incidence de l'onde en radians
    pub incident_angle_rad: f64,
}

impl Default for GuaninePlateletLattice {
    fn default() -> Self {
        Self {
            spacing_d_nm: 160.0,
            effective_refractive_index: 1.56,
            incident_angle_rad: 0.0, // Incidence normale
        }
    }
}

/// Cellule Iridophore pour la diffraction structurelle et le polymorphisme d'affichage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Iridophore {
    pub id: String,
    pub lattice: GuaninePlateletLattice,
    pub osmotic_turgor: f64, // [0.0 = comprimé / bleu, 1.0 = dilaté / rouge]
}

impl Iridophore {
    pub fn new(id: &str) -> Self {
        Self {
            id: id.to_string(),
            lattice: GuaninePlateletLattice::default(),
            osmotic_turgor: 0.5,
        }
    }

    /// Calcule la longueur d'onde réfléchie dominante selon la loi de Bragg-Snell :
    /// $\lambda = 2 \cdot d \cdot \sqrt{n_{\text{eff}}^2 - \sin^2(\theta)}$
    pub fn calculate_reflected_wavelength_nm(&self) -> f64 {
        let n = self.lattice.effective_refractive_index;
        let theta = self.lattice.incident_angle_rad;
        let sin_sq = theta.sin().powi(2);
        let root = (n.powi(2) - sin_sq).max(0.0).sqrt();
        (2.0 * self.lattice.spacing_d_nm * root * 10.0).round() / 10.0
    }

    /// Détermine la couleur structurelle optique
    pub fn optical_hue_name(&self) -> &'static str {
        let lambda = self.calculate_reflected_wavelength_nm();
        if lambda < 400.0 {
            "ULTRAVIOLET"
        } else if lambda < 450.0 {
            "DEEP_VIOLET"
        } else if lambda < 495.0 {
            "CYAN_BLUE"
        } else if lambda < 570.0 {
            "EMERALD_GREEN"
        } else if lambda < 590.0 {
            "GOLDEN_YELLOW"
        } else if lambda < 700.0 {
            "RUBY_RED"
        } else {
            "INFRARED"
        }
    }

    /// Modifie l'espacement des cristaux par signal osmotique ou contraction d'actomyosine
    pub fn shift_lattice_spacing(&mut self, target_spacing_nm: f64) -> f64 {
        self.lattice.spacing_d_nm = target_spacing_nm.clamp(100.0, 300.0);
        self.osmotic_turgor = ((self.lattice.spacing_d_nm - 100.0) / 200.0).clamp(0.0, 1.0);
        self.calculate_reflected_wavelength_nm()
    }

    /// Rendu polymorphique de données selon la perspective de l'observateur
    pub fn render_polymorphic(&self, raw_data: &str, perspective: &ObserverPerspective) -> String {
        let wavelength = self.calculate_reflected_wavelength_nm();
        let hue = self.optical_hue_name();

        match perspective {
            ObserverPerspective::TuiAnsi => {
                let ansi_code = match hue {
                    "CYAN_BLUE" | "DEEP_VIOLET" => "\x1b[34m",
                    "EMERALD_GREEN" => "\x1b[32m",
                    "GOLDEN_YELLOW" => "\x1b[33m",
                    "RUBY_RED" => "\x1b[31m",
                    _ => "\x1b[35m",
                };
                format!(
                    "{}[IRIDOPHORE: {} ({:.1}nm)]\x1b[0m {}",
                    ansi_code,
                    hue,
                    wavelength,
                    escape_terminal_controls(raw_data)
                )
            }
            ObserverPerspective::StructuredJson => serde_json::json!({
                "iridophore_id": self.id,
                "spectral_band_nm": wavelength,
                "color_hue": hue,
                "lattice_spacing_nm": self.lattice.spacing_d_nm,
                "payload": raw_data
            })
            .to_string(),
            ObserverPerspective::MarkdownVisual => {
                format!(
                    "**[{}]** (`{:.1} nm`) — *{}*",
                    hue,
                    wavelength,
                    escape_markdown_text(raw_data)
                )
            }
            ObserverPerspective::CrypticCamouflage => {
                // Décalage César déterministe pour varier la sortie, sans sécurité cryptographique.
                let shift = ((wavelength as u32) % 26) as u8;
                let mut cloaked = String::with_capacity(raw_data.len());
                for character in raw_data.chars() {
                    if character.is_control() {
                        cloaked.push_str(&format!("\\u{{{:04x}}}", character as u32));
                    } else if character.is_ascii_alphabetic() {
                        let base = if character.is_ascii_lowercase() { b'a' } else { b'A' };
                        cloaked.push((((character as u8 - base + shift) % 26) + base) as char);
                    } else {
                        cloaked.push(character);
                    }
                }
                format!("CLOAKED_POLYMORPHIC_{}:{}", (wavelength as u32), cloaked)
            }
        }
    }
}

fn escape_terminal_controls(raw_data: &str) -> String {
    let mut escaped = String::with_capacity(raw_data.len());
    for character in raw_data.chars() {
        if character.is_control() {
            escaped.push_str(&format!("\\u{{{:04x}}}", character as u32));
        } else {
            escaped.push(character);
        }
    }
    escaped
}

fn escape_markdown_text(raw_data: &str) -> String {
    let mut escaped = String::with_capacity(raw_data.len());
    for character in raw_data.chars() {
        if character.is_control() || matches!(character, '\u{2028}' | '\u{2029}') {
            escaped.push_str(&format!("\\u{{{:04x}}}", character as u32));
        } else {
            if character.is_ascii_punctuation() {
                escaped.push('\\');
            }
            escaped.push(character);
        }
    }
    escaped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bragg_snell_structural_color_shifts() {
        let mut iridophore = Iridophore::new("chameleon_dermis_1");

        // Espacement (150 nm) -> Bleu
        iridophore.shift_lattice_spacing(150.0);
        let blue_lambda = iridophore.calculate_reflected_wavelength_nm();
        assert!(blue_lambda >= 450.0 && blue_lambda < 495.0);
        assert_eq!(iridophore.optical_hue_name(), "CYAN_BLUE");

        // Dilatation du réseau cristallin (180 nm) -> Vert
        iridophore.shift_lattice_spacing(180.0);
        let green_lambda = iridophore.calculate_reflected_wavelength_nm();
        assert!(green_lambda >= 495.0 && green_lambda < 570.0);
        assert_eq!(iridophore.optical_hue_name(), "EMERALD_GREEN");

        // Grande dilatation (220 nm) -> Rouge
        iridophore.shift_lattice_spacing(220.0);
        let red_lambda = iridophore.calculate_reflected_wavelength_nm();
        assert!(red_lambda >= 590.0 && red_lambda < 700.0);
        assert_eq!(iridophore.optical_hue_name(), "RUBY_RED");
    }

    #[test]
    fn test_polymorphic_rendering_modes() {
        let mut iridophore = Iridophore::new("cephalopod_irido_1");
        iridophore.shift_lattice_spacing(180.0);

        let data = "CONFIDENTIAL_STATE";
        let tui_view = iridophore.render_polymorphic(data, &ObserverPerspective::TuiAnsi);
        assert!(tui_view.contains("\x1b[32m"));

        let json_view = iridophore.render_polymorphic(data, &ObserverPerspective::StructuredJson);
        assert!(json_view.contains("\"color_hue\":\"EMERALD_GREEN\""));

        let cloak_view =
            iridophore.render_polymorphic(data, &ObserverPerspective::CrypticCamouflage);
        assert!(cloak_view.starts_with("CLOAKED_POLYMORPHIC_"));
    }

    #[test]
    fn hostile_payloads_remain_data_for_every_observer_perspective() {
        let iridophore = Iridophore::new("format-contract");
        let raw_data = "visible\x1b[2J\n# heading\n**bold** [link](javascript:alert(1))\r\t";
        let perspectives = [
            ObserverPerspective::StructuredJson,
            ObserverPerspective::TuiAnsi,
            ObserverPerspective::MarkdownVisual,
            ObserverPerspective::CrypticCamouflage,
        ];

        for perspective in perspectives {
            let rendered = iridophore.render_polymorphic(raw_data, &perspective);
            match perspective {
                ObserverPerspective::StructuredJson => {
                    let parsed: serde_json::Value = serde_json::from_str(&rendered).unwrap();
                    assert_eq!(parsed["payload"], raw_data);
                }
                ObserverPerspective::TuiAnsi => {
                    assert_eq!(rendered.matches('\x1b').count(), 2);
                    assert!(rendered.contains("visible\\u{001b}[2J\\u{000a}# heading"));
                    assert!(rendered.contains("\\u{000d}\\u{0009}"));
                }
                ObserverPerspective::MarkdownVisual => {
                    assert!(!rendered.contains('\n'));
                    assert!(rendered.contains("\\u{001b}\\[2J\\u{000a}\\# heading"));
                    assert!(rendered.contains("\\u{000d}\\u{0009}"));
                    assert!(rendered.contains("\\*\\*bold\\*\\*"));
                    assert!(rendered.contains("\\[link\\]\\(javascript\\:alert\\(1\\)\\)"));
                }
                ObserverPerspective::CrypticCamouflage => {
                    assert_eq!(
                        rendered,
                        iridophore.render_polymorphic(raw_data, &perspective)
                    );
                    assert!(rendered.starts_with("CLOAKED_POLYMORPHIC_"));
                    assert!(!rendered.chars().any(char::is_control));
                }
            }
        }
    }
}
