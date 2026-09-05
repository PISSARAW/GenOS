use std::f64::consts::PI;

#[derive(Clone, Debug)]
pub struct KuramotoOscillator {
    pub id: String,
    pub phase: f64,
    pub natural_frequency: f64,
}

impl KuramotoOscillator {
    pub fn new(id: &str, phase: f64, natural_frequency: f64) -> Self {
        Self {
            id: id.to_string(),
            phase,
            natural_frequency,
        }
    }

    pub fn step(&mut self, peers: &[KuramotoOscillator], coupling_k: f64, dt: f64) {
        if peers.is_empty() {
            self.phase = (self.phase + self.natural_frequency * dt) % (2.0 * PI);
            return;
        }

        let mut coupling_sum = 0.0;
        for peer in peers {
            if peer.id != self.id {
                coupling_sum += (peer.phase - self.phase).sin();
            }
        }

        let d_theta = self.natural_frequency + (coupling_k / peers.len() as f64) * coupling_sum;
        self.phase = (self.phase + d_theta * dt) % (2.0 * PI);
        if self.phase < 0.0 {
            self.phase += 2.0 * PI;
        }
    }
}
