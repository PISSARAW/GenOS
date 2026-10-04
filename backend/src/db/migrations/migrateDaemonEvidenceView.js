module.exports = {
  async run(db) {
    await db.exec('DROP VIEW IF EXISTS v_daemon_evidence_balance');
    await db.exec(`
CREATE VIEW v_daemon_evidence_balance AS
SELECT
    finding_id,
    COUNT(*) FILTER (WHERE side = 'supporting') AS supporting,
    COUNT(*) FILTER (WHERE side = 'contradicting') AS contradicting,
    COUNT(*) AS total
FROM daemon_finding_evidence
GROUP BY finding_id;
`);
  }
};
