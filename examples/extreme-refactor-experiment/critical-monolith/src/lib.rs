pub fn public_total(values: &[i64]) -> i64 {
    values.iter().sum()
}

pub fn public_version() -> &'static str {
    "v1"
}
