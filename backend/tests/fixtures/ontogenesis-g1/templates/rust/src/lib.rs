#[derive(Debug, Clone, PartialEq)]
pub struct Summary {
    pub count: usize,
    pub sum: f64,
    pub average: f64,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

pub fn average(values: &[f64]) -> Option<f64> {
    if values.iter().any(|value| !value.is_finite()) {
        return None;
    }
    if values.is_empty() {
        return Some(0.0);
    }
    Some(values.iter().sum::<f64>() / values.len() as f64)
}

pub fn percentile(values: &[f64], p: f64) -> Option<f64> {
    if !p.is_finite() || !(0.0..=100.0).contains(&p)
        || values.is_empty() || values.iter().any(|value| !value.is_finite()) {
        return None;
    }
    let mut ordered = values.to_vec();
    ordered.sort_by(|left, right| left.total_cmp(right));
    let index = ((p / 100.0) * ordered.len() as f64).floor() as usize;
    ordered.get(index).copied()
}

pub fn summary(values: &[f64]) -> Summary {
    Summary {
        count: values.len(),
        sum: values.iter().sum(),
        average: if values.is_empty() { 0.0 } else { values.iter().sum::<f64>() / values.len() as f64 },
        min: values.iter().copied().reduce(f64::min),
        max: values.iter().copied().reduce(f64::max),
    }
}
