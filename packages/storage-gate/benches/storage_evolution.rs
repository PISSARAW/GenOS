use criterion::{criterion_group, criterion_main, Criterion, black_box};

fn bench_insert_1000(c: &mut Criterion) {
    c.bench_function("sqlite_insert_1000", |b| {
        b.iter(|| {
            let conn = rusqlite::Connection::open_in_memory().unwrap();
            conn.execute(
                "CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, status TEXT, tokens REAL)",
                [],
            )
            .unwrap();
            for i in 0..1000 {
                conn.execute(
                    "INSERT INTO agents (id, name, status, tokens) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![
                        black_box(format!("agent_{}", i)),
                        black_box("test"),
                        black_box("active"),
                        black_box(i as f64 * 100.0),
                    ],
                )
                .unwrap();
            }
        })
    });
}

fn bench_olap_aggregation(c: &mut Criterion) {
    c.bench_function("sqlite_olap_aggregation", |b| {
        b.iter(|| {
            let conn = rusqlite::Connection::open_in_memory().unwrap();
            conn.execute(
                "CREATE TABLE telemetry (id INTEGER PRIMARY KEY, agent_id TEXT, tokens REAL, cost REAL, created_at TEXT)",
                [],
            )
            .unwrap();
            for i in 0..10000 {
                conn.execute(
                    "INSERT INTO telemetry (agent_id, tokens, cost, created_at) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![
                        black_box(format!("agent_{}", i % 100)),
                        black_box(i as f64),
                        black_box(i as f64 * 0.01),
                        black_box("2026-09-23"),
                    ],
                )
                .unwrap();
            }
            let _: f64 = conn
                .query_row(
                    "SELECT SUM(tokens) FROM telemetry WHERE agent_id LIKE 'agent_%'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
        })
    });
}

criterion_group!(benches, bench_insert_1000, bench_olap_aggregation);
criterion_main!(benches);
