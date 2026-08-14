fn main() {
    let schema = include_str!("../../data/schema_v1.txt");
    assert!(schema.contains("accounts"));
    println!("migration_ok");
}
