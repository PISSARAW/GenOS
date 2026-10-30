'use strict';

async function applyCheapUpdateStage1(__genosStageScope1) {
if (__genosStageScope1.event.type === 'TERRITORY_FILE_CHANGED') {
    const files = (0, __genosStageScope1.safeChangedFiles)((0, __genosStageScope1.require)('./daemonEventBridgeServiceValues1.js').applyCheapUpdateValue1({ event: __genosStageScope1.event }));
    const fresh = __genosStageScope1.stored.territory.state !== 'STALE' && __genosStageScope1.stored.territory.indexedHeadSha === __genosStageScope1.stored.territory.headSha;
    if (!files?.length || !fresh) {
      await (0, __genosStageScope1.markIndexStale)(__genosStageScope1.bridge.db, __genosStageScope1.event.territoryId);
      return { value: ( { applied: false, reason: files?.length ? 'index-already-stale' : 'changed-files-unavailable' }) };
    }
    try {
      const result = await __genosStageScope1.cartographer.updateFiles(__genosStageScope1.bridge.db, { territoryId: __genosStageScope1.event.territoryId,
        rootPath: __genosStageScope1.stored.territory.rootPath, files });
      return { value: ( { applied: true, kind: 'files', ...result }) };
    } catch (_) {
      await (0, __genosStageScope1.markIndexStale)(__genosStageScope1.bridge.db, __genosStageScope1.event.territoryId);
      return { value: ( { applied: false, reason: 'file-index-refresh-failed' }) };
    }
  }
}

module.exports = { applyCheapUpdateStage1 };
