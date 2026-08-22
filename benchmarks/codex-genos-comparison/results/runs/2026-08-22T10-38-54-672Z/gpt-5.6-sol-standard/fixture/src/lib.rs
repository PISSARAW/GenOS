pub struct PricingEngine {
    source_rate: f64,
    cached_rate: f64,
}

impl PricingEngine {
    pub fn new(rate: f64) -> Self {
        Self { source_rate: rate, cached_rate: rate }
    }

    pub fn update_configuration(&mut self, rate: f64) {
        self.source_rate = rate;
    }

    pub fn quote(&self, base: f64) -> f64 {
        base * self.cached_rate
    }

    pub fn trace_is_fresh(&self) -> bool {
        self.source_rate == self.cached_rate
    }
}
