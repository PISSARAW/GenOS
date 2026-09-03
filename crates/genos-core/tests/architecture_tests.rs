use std::fs;
use std::path::Path;

fn check_file_length_recursive(dir: &Path, max_lines: usize) {
    if dir.is_dir() {
        for entry in fs::read_dir(dir).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.is_dir() {
                check_file_length_recursive(&path, max_lines);
            } else if path.extension().map_or(false, |ext| ext == "rs") {
                let content = fs::read_to_string(&path).unwrap();
                let line_count = content.lines().count();
                // We assert with a custom message. 
                // We use assert! so the test framework catches it.
                assert!(
                    line_count <= max_lines,
                    "VIOLATION D''ARCHITECTURE: Le fichier {:?} a {} lignes (Maximum autorisé: {})! REFACTORISATION EXIGÉE.",
                    path,
                    line_count,
                    max_lines
                );
            }
        }
    }
}

#[test]
fn test_strict_file_size_limits() {
    let src_path = Path::new("src");
    // Some current files might be > 400. This test will enforce it.
    // If it fails now, the user knows the rule is active and will catch any offenses.
    check_file_length_recursive(src_path, 400);
}
