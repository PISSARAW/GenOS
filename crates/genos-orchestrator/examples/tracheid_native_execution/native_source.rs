//! Fixed operation templates for the opt-in native conformance probe.

pub(crate) const NATIVE_EXECUTOR: &str = r#"
const THRESHOLD_BITS: u64 = __THRESHOLD_BITS__;
const MAX_BATCH: usize = 512;
const MAX_INPUT_BYTES: u64 = 65_536;

fn main() {
    if let Err(message) = run() {
        eprintln!("{message}");
        std::process::exit(2);
    }
}

fn run() -> Result<(), String> {
    let mut args = std::env::args_os();
    args.next();
    let input_path = args.next().ok_or("input path is required")?;
    if args.next().is_some() {
        return Err("unexpected native executor argument".into());
    }
    let metadata = std::fs::metadata(&input_path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_INPUT_BYTES {
        return Err("native input exceeds byte limit".into());
    }
    let input = std::fs::read_to_string(input_path).map_err(|error| error.to_string())?;
    let mut rows = 0usize;
    for line in input.lines() {
        rows += 1;
        if rows > MAX_BATCH {
            return Err("native input exceeds row limit".into());
        }
        execute_line(line)?;
    }
    Ok(())
}

fn execute_line(line: &str) -> Result<(), String> {
    let mut fields = line.split_whitespace();
    let volume_bits = parse_bits(fields.next())?;
    let tension_bits = parse_bits(fields.next())?;
    if fields.next().is_some() {
        return Err("native input row has extra fields".into());
    }
    let volume = f64::from_bits(volume_bits);
    let tension_mpa = f64::from_bits(tension_bits);
    if !volume.is_finite() || volume < 0.0 || !tension_mpa.is_finite() {
        return Err("native input values are invalid".into());
    }
    let cavitation_detected = tension_mpa < f64::from_bits(THRESHOLD_BITS);
    let transported_volume = if cavitation_detected { 0.0 } else { volume };
    println!(
        "{} {} {} {}",
        transported_volume.to_bits(),
        tension_mpa.to_bits(),
        u8::from(cavitation_detected),
        0.0_f64.to_bits()
    );
    Ok(())
}

fn parse_bits(value: Option<&str>) -> Result<u64, String> {
    value.ok_or_else(|| "native input row is incomplete".to_string())?
        .parse::<u64>()
        .map_err(|error| error.to_string())
}
"#;
