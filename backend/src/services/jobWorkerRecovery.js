const { updateCampaignStatus } = require('./jobWorkerEvaluation');

async function recoverInterruptedJobs(db) {
  const staleMinutes = Math.max(1, Math.min(1440, Number(process.env.GENOS_STALE_JOB_MINUTES) || 15));
  const stale = `claimed_at IS NULL OR claimed_at < datetime('now', ?) `;
  await db.run(
    `UPDATE workflow_runs
        SET status = CASE WHEN attempts + 1 < max_attempts THEN 'queued' ELSE 'failed' END,
            attempts = attempts + 1,
            error_json = COALESCE(error_json, ?),
            completed_at = CASE WHEN attempts + 1 < max_attempts THEN NULL ELSE COALESCE(completed_at, CURRENT_TIMESTAMP) END,
            claimed_at = NULL,
            claim_token = NULL,
            next_attempt_at = NULL
      WHERE status = 'running' AND (${stale})`,
    JSON.stringify({ message: 'Worker claim became stale; workflow recovery scheduled.', retryable: true }), `-${staleMinutes} minutes`
  );
  for (const table of ['evaluation_jobs', 'model_jobs']) {
    await db.run(`UPDATE ${table} SET status = CASE WHEN attempts + 1 < max_attempts THEN 'queued' ELSE 'failed' END, attempts = attempts + 1, error_json = COALESCE(error_json, ?), completed_at = CASE WHEN attempts + 1 < max_attempts THEN NULL ELSE COALESCE(completed_at, CURRENT_TIMESTAMP) END, claimed_at = NULL, claim_token = NULL, next_attempt_at = NULL WHERE status = 'running' AND (${stale})`, JSON.stringify({ message: 'Worker claim became stale; retry scheduled.', retryable: true }), `-${staleMinutes} minutes`);
  }
  const campaigns = await db.all("SELECT DISTINCT campaign_id FROM evaluation_jobs WHERE campaign_id IS NOT NULL");
  for (const campaign of campaigns) await updateCampaignStatus(db, campaign.campaign_id);
}

module.exports = { recoverInterruptedJobs };
