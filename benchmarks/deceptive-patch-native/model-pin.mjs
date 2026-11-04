import protocol from './protocol.json' with {type: 'json'};
import ledgerApi from './proxy-ledger.cjs';

export async function verifyModel(context) {
  const result = await fetch(context.options.upstream + '/api/tags', {signal: AbortSignal.timeout(10000)});
  if (!result.ok) throw Error('DPB_MODEL_PIN_UNAVAILABLE');
  const tags = await result.json();
  const entry = tags.models?.find(model => model.name === protocol.model);
  ledgerApi.record(context.ledger, {type: 'model-pin', name: protocol.model, digest: entry?.digest || null});
  if (entry?.digest !== protocol.modelDigest) throw Error('DPB_MODEL_DIGEST_CHANGED');
}
