'use strict';

async function applyCheapUpdate(context) {
if (context.event.type === 'TERRITORY_FILE_CHANGED') {
    const files = context.safeChangedFiles(context.require('./daemonEventBridgeServiceRules.js').applyCheapUpdate({ event: context.event }));
    const fresh = context.stored.territory.state !== 'STALE' && context.stored.territory.indexedHeadSha === context.stored.territory.headSha;
    if (!files?.length || !fresh) {
      await context.markIndexStale(context.bridge.db, context.event.territoryId);
      return { value: ( { applied: false, reason: files?.length ? 'index-already-stale' : 'changed-files-unavailable' }) };
    }
    try {
      const result = await context.cartographer.updateFiles(context.bridge.db, { territoryId: context.event.territoryId,
        rootPath: context.stored.territory.rootPath, files });
      return { value: ( { applied: true, kind: 'files', ...result }) };
    } catch (_) {
      await context.markIndexStale(context.bridge.db, context.event.territoryId);
      return { value: ( { applied: false, reason: 'file-index-refresh-failed' }) };
    }
  }
}

module.exports = { applyCheapUpdate };
