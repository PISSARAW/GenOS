export function bridgePayloadTransport({ payload, bridge, executor }) {
  const serialized = JSON.stringify({ ...payload, executor });
  if (payload.action === 'dispatch_biological' && payload.community_id) {
    return { args: [bridge, '--payload-stdin'], stdinText: serialized };
  }
  return { args: [bridge, serialized] };
}
