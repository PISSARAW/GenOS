'use strict';

function writeArtifacts(context) {
for (const entry of context.artifacts) {
    const issues = context.validateArtifactEntry(entry, context.state);
    if (issues.length) {
      context.rejected.push({ name: entry.name, issues });
      continue;
    }
    try {
      const record = context.writeArtifact(context.state, entry.name, entry.content);
      const target = context.path.resolve(context.state.workspaceRoot, entry.name.trim());
      if (!context.fs.existsSync(target) || !context.fs.statSync(target).isFile()) {
        context.rejected.push({ name: entry.name, issues: ['artifact.write.missing_on_disk'] });
        continue;
      }
      const onDisk = context.crypto.createHash('sha256').update(context.fs.readFileSync(target)).digest('hex');
      if (onDisk !== record.sha256) {
        context.rejected.push({ name: entry.name, issues: ['artifact.write.hash_mismatch'] });
        continue;
      }
      context.written.push({ ...record, verified: true });
    } catch (error) {
      context.rejected.push({ name: entry.name, issues: [`artifact.write.error:${error.message}`] });
    }
  }
}

module.exports = { writeArtifacts };
