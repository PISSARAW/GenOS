'use strict';

async function migrateRustKernelMissionPlans(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS rust_kernel_mission_plans (
    mission_id TEXT PRIMARY KEY,
    schema TEXT NOT NULL,
    objective_hash TEXT NOT NULL,
    plan_hash TEXT NOT NULL,
    plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mission_id) REFERENCES missions(mission_id) ON DELETE RESTRICT
  );
  CREATE TRIGGER IF NOT EXISTS rust_kernel_mission_plan_no_update
    BEFORE UPDATE ON rust_kernel_mission_plans
    BEGIN SELECT RAISE(ABORT, 'Rust kernel mission plans are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS rust_kernel_mission_plan_no_delete
    BEFORE DELETE ON rust_kernel_mission_plans
    BEGIN SELECT RAISE(ABORT, 'Rust kernel mission plans are durable evidence'); END;`);
}

module.exports = { migrateRustKernelMissionPlans };
