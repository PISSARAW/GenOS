'use strict';

function writeArtifactsStage1(__genosStageScope1) {
for (const entry of __genosStageScope1.artifacts) {
    const issues = (0, __genosStageScope1.validateArtifactEntry)(entry, __genosStageScope1.state);
    if (issues.length) {
      __genosStageScope1.rejected.push({ name: entry.name, issues });
      continue;
    }
    try {
      const record = (0, __genosStageScope1.writeArtifact)(__genosStageScope1.state, entry.name, entry.content);
      const target = __genosStageScope1.path.resolve(__genosStageScope1.state.workspaceRoot, entry.name.trim());
      if (!__genosStageScope1.fs.existsSync(target) || !__genosStageScope1.fs.statSync(target).isFile()) {
        __genosStageScope1.rejected.push({ name: entry.name, issues: ['artifact.write.missing_on_disk'] });
        continue;
      }
      const onDisk = __genosStageScope1.crypto.createHash('sha256').update(__genosStageScope1.fs.readFileSync(target)).digest('hex');
      if (onDisk !== record.sha256) {
        __genosStageScope1.rejected.push({ name: entry.name, issues: ['artifact.write.hash_mismatch'] });
        continue;
      }
      __genosStageScope1.written.push({ ...record, verified: true });
    } catch (error) {
      __genosStageScope1.rejected.push({ name: entry.name, issues: [`artifact.write.error:${error.message}`] });
    }
  }
}

module.exports = { writeArtifactsStage1 };
