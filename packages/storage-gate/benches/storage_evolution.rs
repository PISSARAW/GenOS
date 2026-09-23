use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::time::Duration;

fn bench_sqlite_query(c: &mut Criterion) {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, role TEXT, status TEXT);
         INSERT INTO agents VALUES ('a1', 'Alice', 'worker', 'idle'),
                                  ('a2', 'Bob', 'worker', 'running'),
                                  ('a3', 'Charlie', 'worker', 'completed');",
    ).unwrap();

    c.bench_function("sqlite_select_agents", |b| {
        b.iter(|| {
            let mut stmt = conn.prepare("SELECT * FROM agents WHERE status = ?").unwrap();
            let rows: Vec<(String, String, String, String)> = stmt
                .query_map(black_box("idle"), |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap();
            black_box(rows)
        })
    });
}

fn bench_serialization(c: &mut Criterion) {
    let payload = r#"{"table":"agents","operation":"INSERT","id":"agent-42","name":"Test","role":"worker"}"#;
    c.bench_function("json_parse_small", |b| {
        b.iter(|| {
            let parsed: serde_json::Value = serde_json::from_str(black_box(payload)).unwrap();
            black_box(parsed)
        })
    });
}

fn bench_scope_key(c: &mut Criterion) {
    c.bench_function("scope_key_generation", |b| {
        b.iter(|| {
            let key = format!("{}:{}", black_box("org-123"), black_box("proj-456"));
            black_box(key)
        })
    });
}

criterion_group! {
    name = benches;
    config = Criterion::default()
        .measurement_time(Duration::from_secs(5))
        .sample_size(50);
    targets = bench_sqlite_query, bench_serialization, bench_scope_key
}
criterion_main!(benches);
