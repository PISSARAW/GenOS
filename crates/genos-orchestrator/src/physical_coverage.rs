//! Rapports LCOV et Istanbul : validation, déduplication et fraîcheur des sources.
use super::physical_measurements::*;
use std::collections::BTreeMap;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Default)]
struct CoverageRecords {
    lines: BTreeMap<String, BTreeMap<u64, bool>>,
    branches: BTreeMap<String, BTreeMap<String, bool>>,
}

pub fn coverage(
    config: &WorkspacePhysicsConfig,
    inventory: &Measurement<WorkspaceInventory>,
) -> Measurement<CoverageObservation> {
    let mut failure = Measurement::unavailable("LCOV/Istanbul", MeasurementStatus::Missing);
    let mut reports: Vec<_> = config
        .coverage_paths
        .iter()
        .filter_map(|path| {
            let resolved = confined(&config.root, path).ok()?;
            let modified = std::fs::metadata(&resolved)
                .ok()?
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()?;
            Some((modified.as_millis() as u64, path))
        })
        .collect();
    reports.sort_by(|a, b| b.0.cmp(&a.0));
    for (modified, path) in reports {
        let source = path.to_string_lossy().replace('\\', "/");
        match read_report(config, (&source, modified), inventory) {
            Ok(value) => return Measurement::measured(value, source),
            Err((status, detail)) => {
                failure = Measurement::unavailable(source, status);
                failure.detail = Some(detail);
            }
        }
    }
    failure
}

fn read_report(
    config: &WorkspacePhysicsConfig,
    report: (&str, u64),
    inventory: &Measurement<WorkspaceInventory>,
) -> Result<CoverageObservation, (MeasurementStatus, String)> {
    let (source, modified) = report;
    if modified > now_ms().saturating_add(5_000) {
        return Err((
            MeasurementStatus::Invalid,
            "coverage report dated in future".into(),
        ));
    }
    if now_ms().saturating_sub(modified) > config.report_max_age.as_millis() as u64 {
        return Err((MeasurementStatus::Stale, "coverage report expired".into()));
    }
    let text =
        read_document(config, source).map_err(|error| (MeasurementStatus::Invalid, error))?;
    let records = if source.ends_with(".json") {
        parse_istanbul(config, &text)
    } else {
        parse_lcov(config, &text)
    }
    .map_err(|error| (MeasurementStatus::Invalid, error))?;
    validate_freshness(config, (&records, modified), inventory)
        .map_err(|error| (MeasurementStatus::Stale, error))?;
    Ok(summarize(records))
}

fn validate_freshness(
    config: &WorkspacePhysicsConfig,
    observed: (&CoverageRecords, u64),
    inventory: &Measurement<WorkspaceInventory>,
) -> Result<(), String> {
    let (records, modified) = observed;
    if records.lines.is_empty() {
        return Err("no measured source lines".into());
    }
    for name in records.lines.keys() {
        let source_modified = inventory
            .usable()
            .and_then(|value| value.files.get(name))
            .map(|file| file.modified_at_ms)
            .or_else(|| {
                let path = confined(&config.root, Path::new(name)).ok()?;
                let time = std::fs::metadata(path)
                    .ok()?
                    .modified()
                    .ok()?
                    .duration_since(UNIX_EPOCH)
                    .ok()?;
                Some(time.as_millis() as u64)
            })
            .ok_or("source freshness unknown")?;
        if source_modified > modified {
            return Err(format!("source newer than coverage: {name}"));
        }
    }
    Ok(())
}

fn source_name(config: &WorkspacePhysicsConfig, raw: &str) -> Result<String, String> {
    let root = config
        .root
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let candidate = Path::new(raw);
    let resolved = confined(&root, candidate)?;
    if !resolved.is_file() {
        return Err("coverage source is not a file".into());
    }
    Ok(resolved
        .strip_prefix(&root)
        .unwrap()
        .to_string_lossy()
        .replace('\\', "/"))
}

fn parse_lcov(config: &WorkspacePhysicsConfig, text: &str) -> Result<CoverageRecords, String> {
    let mut records = CoverageRecords::default();
    let mut current = None;
    for line in text.lines().map(str::trim) {
        if let Some(raw) = line.strip_prefix("SF:") {
            current = Some(source_name(config, raw)?);
        } else if line == "end_of_record" {
            current = None;
        } else if let Some(raw) = line.strip_prefix("DA:") {
            record_line(&mut records, current.as_deref(), raw)?;
        } else if let Some(raw) = line.strip_prefix("BRDA:") {
            record_branch(&mut records, current.as_deref(), raw)?;
        }
    }
    if records.lines.values().all(BTreeMap::is_empty) {
        return Err("report contains no line observations".into());
    }
    Ok(records)
}

fn record_line(
    records: &mut CoverageRecords,
    source: Option<&str>,
    raw: &str,
) -> Result<(), String> {
    let source = source.ok_or("DA without SF")?;
    let mut fields = raw.split(',');
    let line = fields
        .next()
        .ok_or("line missing")?
        .parse::<u64>()
        .map_err(|error| error.to_string())?;
    let hits = fields
        .next()
        .ok_or("hits missing")?
        .parse::<u64>()
        .map_err(|error| error.to_string())?;
    if line == 0 {
        return Err("line numbers must be positive".into());
    }
    let observed = records
        .lines
        .entry(source.into())
        .or_default()
        .entry(line)
        .or_default();
    *observed |= hits > 0;
    Ok(())
}

fn record_branch(
    records: &mut CoverageRecords,
    source: Option<&str>,
    raw: &str,
) -> Result<(), String> {
    let source = source.ok_or("BRDA without SF")?;
    let fields: Vec<_> = raw.split(',').collect();
    validate_branch_fields(&fields)?;
    let hit = branch_hit(fields[3])?;
    let key = fields[..3].join(":");
    let observed = records
        .branches
        .entry(source.into())
        .or_default()
        .entry(key)
        .or_default();
    *observed |= hit;
    Ok(())
}

fn parse_istanbul(config: &WorkspacePhysicsConfig, text: &str) -> Result<CoverageRecords, String> {
    let value: serde_json::Value = serde_json::from_str(text).map_err(|error| error.to_string())?;
    let reports = value.as_object().ok_or("coverage must be an object")?;
    let mut records = CoverageRecords::default();
    for (raw, report) in reports {
        let name = source_name(
            config,
            report
                .get("path")
                .and_then(|path| path.as_str())
                .unwrap_or(raw),
        )?;
        istanbul_lines(&mut records, &name, report)?;
        istanbul_branches(&mut records, &name, report)?;
    }
    Ok(records)
}

fn istanbul_branches(
    records: &mut CoverageRecords,
    name: &str,
    report: &serde_json::Value,
) -> Result<(), String> {
    if let Some(branches) = report.get("b").and_then(|map| map.as_object()) {
        for (id, counts) in branches {
            for (index, count) in counts
                .as_array()
                .ok_or("invalid branch counters")?
                .iter()
                .enumerate()
            {
                let hit = count.as_u64().ok_or("invalid branch hit count")? > 0;
                records
                    .branches
                    .entry(name.into())
                    .or_default()
                    .entry(format!("{id}:{index}"))
                    .and_modify(|previous| *previous |= hit)
                    .or_insert(hit);
            }
        }
    }
    Ok(())
}

fn summarize(records: CoverageRecords) -> CoverageObservation {
    let mut result = CoverageObservation::default();
    for (source, lines) in records.lines {
        let found = lines.len();
        let hit = lines.values().filter(|covered| **covered).count();
        result.lines_found += found;
        result.lines_hit += hit;
        result.files.insert(source, (found, hit));
    }
    for branches in records.branches.values() {
        result.branches_found += branches.len();
        result.branches_hit += branches.values().filter(|hit| **hit).count();
    }
    result
}

fn branch_hit(value: &str) -> Result<bool, String> {
    if value == "-" {
        return Ok(false);
    }
    Ok(value.parse::<u64>().map_err(|error| error.to_string())? > 0)
}

fn validate_branch_fields(fields: &[&str]) -> Result<(), String> {
    if fields.len() != 4 {
        return Err("invalid branch record".into());
    }
    fields[0]
        .parse::<u64>()
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn istanbul_lines(
    records: &mut CoverageRecords,
    name: &str,
    report: &serde_json::Value,
) -> Result<(), String> {
    let statements = report
        .get("statementMap")
        .and_then(|map| map.as_object())
        .ok_or("statementMap missing")?;
    let hits = report
        .get("s")
        .and_then(|map| map.as_object())
        .ok_or("statement counters missing")?;
    for (id, statement) in statements {
        let line = statement
            .pointer("/start/line")
            .and_then(|line| line.as_u64())
            .filter(|line| *line > 0)
            .ok_or("invalid statement line")?;
        let covered = hits
            .get(id)
            .and_then(|hits| hits.as_u64())
            .ok_or("invalid statement counter")?
            > 0;
        *records
            .lines
            .entry(name.to_string())
            .or_default()
            .entry(line)
            .or_default() |= covered;
    }
    Ok(())
}
