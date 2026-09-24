use rusqlite::functions::{Context, FunctionFlags};
use rusqlite::types::Value;
use rusqlite::{Connection, Result};

fn genos_brier_score(ctx: &Context) -> Result<Value> {
    let predictions_str = ctx.get_raw(0).as_str().unwrap_or("[]");
    let outcomes_str = ctx.get_raw(1).as_str().unwrap_or("[]");
    let predictions: Vec<f64> = serde_json::from_str(predictions_str).unwrap_or_default();
    let outcomes: Vec<f64> = serde_json::from_str(outcomes_str).unwrap_or_default();
    if predictions.is_empty() || predictions.len() != outcomes.len() {
        return Ok(Value::Null);
    }
    let n = predictions.len() as f64;
    let score = predictions.iter().zip(outcomes.iter()).map(|(p, o)| (p - o).powi(2)).sum::<f64>() / n;
    Ok(Value::Real(score))
}

fn genos_decay(ctx: &Context) -> Result<Value> {
    let value = ctx.get_raw(0).as_f64().unwrap_or(0.0);
    let age = ctx.get_raw(1).as_f64().unwrap_or(0.0);
    let half_life = ctx.get_raw(2).as_f64().unwrap_or(1.0);
    if half_life <= 0.0 {
        return Ok(Value::Real(0.0));
    }
    Ok(Value::Real(value * (-age / half_life).exp()))
}

fn genos_entropy(ctx: &Context) -> Result<Value> {
    let values_str = ctx.get_raw(0).as_str().unwrap_or("[]");
    let values: Vec<f64> = serde_json::from_str(values_str).unwrap_or_default();
    if values.is_empty() {
        return Ok(Value::Null);
    }
    let total: f64 = values.iter().sum();
    if total <= 0.0 {
        return Ok(Value::Real(0.0));
    }
    let entropy = -values.iter().filter(|&&v| v > 0.0).map(|&v| { let p = v / total; p * p.log2() }).sum::<f64>();
    Ok(Value::Real(entropy))
}

fn genos_evidence_weight(ctx: &Context) -> Result<Value> {
    let supporting = ctx.get_raw(0).as_i64().unwrap_or(0) as f64;
    let contradicting = ctx.get_raw(1).as_i64().unwrap_or(0) as f64;
    let total = supporting + contradicting;
    if total == 0.0 {
        return Ok(Value::Real(0.0));
    }
    Ok(Value::Real((supporting - contradicting) / total))
}

fn genos_calibration_bin(ctx: &Context) -> Result<Value> {
    let prediction = ctx.get_raw(0).as_f64().unwrap_or(-1.0);
    let num_bins = ctx.get_raw(1).as_i64().unwrap_or(10);
    if prediction < 0.0 || prediction > 1.0 || num_bins <= 0 {
        return Ok(Value::Null);
    }
    let bin = (prediction * num_bins as f64).floor() as i64;
    Ok(Value::Integer(if bin >= num_bins { num_bins - 1 } else { bin }))
}

fn genos_scope_key(ctx: &Context) -> Result<Value> {
    let org = ctx.get_raw(0).as_str().unwrap_or("");
    let proj = ctx.get_raw(1).as_str().unwrap_or("");
    Ok(Value::Text(format!("{}:{}", org, proj)))
}

pub fn load_udfs(conn: &Connection) -> Result<()> {
    conn.create_scalar_function("genos_brier_score", 2, FunctionFlags::SQLITE_DETERMINISTIC | FunctionFlags::SQLITE_UTF8, genos_brier_score)?;
    conn.create_scalar_function("genos_decay", 3, FunctionFlags::SQLITE_DETERMINISTIC | FunctionFlags::SQLITE_UTF8, genos_decay)?;
    conn.create_scalar_function("genos_entropy", 1, FunctionFlags::SQLITE_DETERMINISTIC | FunctionFlags::SQLITE_UTF8, genos_entropy)?;
    conn.create_scalar_function("genos_evidence_weight", 2, FunctionFlags::SQLITE_DETERMINISTIC | FunctionFlags::SQLITE_UTF8, genos_evidence_weight)?;
    conn.create_scalar_function("genos_calibration_bin", 2, FunctionFlags::SQLITE_DETERMINISTIC | FunctionFlags::SQLITE_UTF8, genos_calibration_bin)?;
    conn.create_scalar_function("genos_scope_key", 2, FunctionFlags::SQLITE_DETERMINISTIC | FunctionFlags::SQLITE_UTF8, genos_scope_key)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_brier_score() {
        let conn = Connection::open_in_memory().unwrap();
        load_udfs(&conn).unwrap();
        let score: f64 = conn.query_row("SELECT genos_brier_score('[0.9, 0.1, 0.8]', '[1.0, 0.0, 1.0]')", [], |row| row.get(0)).unwrap();
        assert!((score - 0.02).abs() < 0.01);
    }

    #[test]
    fn test_decay() {
        let conn = Connection::open_in_memory().unwrap();
        load_udfs(&conn).unwrap();
        let decayed: f64 = conn.query_row("SELECT genos_decay(1.0, 1.0, 1.0)", [], |row| row.get(0)).unwrap();
        assert!((decayed - 0.367).abs() < 0.01);
    }

    #[test]
    fn test_entropy() {
        let conn = Connection::open_in_memory().unwrap();
        load_udfs(&conn).unwrap();
        let entropy: f64 = conn.query_row("SELECT genos_entropy('[0.5, 0.5]')", [], |row| row.get(0)).unwrap();
        assert!((entropy - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_evidence_weight() {
        let conn = Connection::open_in_memory().unwrap();
        load_udfs(&conn).unwrap();
        let weight: f64 = conn.query_row("SELECT genos_evidence_weight(8, 2)", [], |row| row.get(0)).unwrap();
        assert!((weight - 0.6).abs() < 0.01);
    }

    #[test]
    fn test_calibration_bin() {
        let conn = Connection::open_in_memory().unwrap();
        load_udfs(&conn).unwrap();
        let bin: i64 = conn.query_row("SELECT genos_calibration_bin(0.75, 10)", [], |row| row.get(0)).unwrap();
        assert_eq!(bin, 7);
    }

    #[test]
    fn test_scope_key() {
        let conn = Connection::open_in_memory().unwrap();
        load_udfs(&conn).unwrap();
        let key: String = conn.query_row("SELECT genos_scope_key('org1', 'proj1')", [], |row| row.get(0)).unwrap();
        assert_eq!(key, "org1:proj1");
    }
}
