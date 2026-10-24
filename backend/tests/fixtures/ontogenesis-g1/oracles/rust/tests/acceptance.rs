use g1_metrics::{average, percentile, summary};
use std::fs;
use std::path::PathBuf;

fn candidate_root() -> PathBuf {
    let raw = include_str!("../candidate.path").trim();
    PathBuf::from(raw)
}

fn candidate_source() -> String {
    fs::read_to_string(candidate_root().join("src/lib.rs")).unwrap()
}

fn function_body<'a>(source: &'a str, name: &str) -> &'a str {
    let needle = format!("fn {name}(");
    let Some(start) = source.find(&needle) else { return ""; };
    let Some(open_relative) = source[start..].find('{') else { return ""; };
    let body_start = start + open_relative + 1;
    let mut depth = 1usize;
    for (offset, character) in source[body_start..].char_indices() {
        if character == '{' { depth += 1; }
        if character == '}' {
            depth -= 1;
            if depth == 0 { return &source[body_start..body_start + offset]; }
        }
    }
    ""
}

fn private_functions(source: &str) -> Vec<&str> {
    source.lines().filter_map(|line| {
        let trimmed = line.trim_start();
        if trimmed.starts_with("pub fn ") || !trimmed.starts_with("fn ") { return None; }
        trimmed.strip_prefix("fn ")?.split('(').next()
    }).collect()
}

#[test]
fn independent_acceptance_oracle() {
    let case = include_str!("../case.id").trim();
    match case {
        "average-empty" => {
            assert_eq!(average(&[]), None);
            assert_eq!(average(&[2.0, 4.0]), Some(3.0));
        }
        "percentile-boundary" => {
            let values = [4.0, 1.0, 3.0, 2.0];
            assert_eq!(percentile(&values, 0.0), Some(1.0));
            assert_eq!(percentile(&values, 50.0), Some(3.0));
            assert_eq!(percentile(&values, 100.0), Some(4.0));
            assert_eq!(values, [4.0, 1.0, 3.0, 2.0]);
        }
        #[cfg(feature = "case_median")]
        "median" => {
            let odd = [3.0, 1.0, 2.0];
            let even = [4.0, 1.0, 3.0, 2.0];
            assert_eq!(g1_metrics::median(&odd), Some(2.0));
            assert_eq!(g1_metrics::median(&even), Some(2.5));
            assert_eq!(g1_metrics::median(&[]), None);
            assert_eq!(odd, [3.0, 1.0, 2.0]);
            assert_eq!(even, [4.0, 1.0, 3.0, 2.0]);
        }
        #[cfg(feature = "case_filter_above")]
        "filter-above" => {
            let values = [3.0, 1.0, 4.0, 2.0, 4.0];
            assert_eq!(g1_metrics::filter_above(&values, 3.0), vec![4.0, 4.0]);
            assert_eq!(values, [3.0, 1.0, 4.0, 2.0, 4.0]);
        }
        "api-reference" => {
            let readme = fs::read_to_string(candidate_root().join("README.md")).unwrap().to_lowercase();
            for term in ["average", "percentile", "summary", "median", "filter_above", "empty"] {
                assert!(readme.contains(term));
            }
        }
        "boundary-examples" => {
            let readme = fs::read_to_string(candidate_root().join("README.md")).unwrap();
            let compact: String = readme.chars().filter(|ch| !ch.is_whitespace()).collect();
            for snippet in [
                "percentile(&[1.0,2.0,3.0,4.0],0.0)",
                "percentile(&[1.0,2.0,3.0,4.0],100.0)",
                "median(&[1.0,2.0,3.0])",
                "median(&[1.0,2.0,3.0,4.0])",
            ] {
                assert!(compact.contains(snippet));
            }
        }
        "shared-validation" => {
            let source = candidate_source();
            let average_body = function_body(&source, "average");
            let percentile_body = function_body(&source, "percentile");
            assert!(private_functions(&source).iter().any(|name| {
                average_body.contains(&format!("{name}(")) && percentile_body.contains(&format!("{name}("))
            }));
            assert_eq!(average(&[f64::INFINITY]), None);
            assert_eq!(percentile(&[f64::INFINITY], 50.0), None);
            assert_eq!(average(&[2.0, 4.0]), Some(3.0));
        }
        "summary-helper" => {
            let source = candidate_source();
            let summary_body = function_body(&source, "summary");
            assert!(private_functions(&source).iter().any(|name| summary_body.contains(&format!("{name}("))));
            assert_eq!(summary(&[2.0, 4.0]).average, 3.0);
            assert_eq!(summary(&[2.0, 4.0]).sum, 6.0);
        }
        _ => panic!("unknown oracle"),
    }
}
