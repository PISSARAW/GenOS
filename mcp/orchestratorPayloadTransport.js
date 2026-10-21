export function bridgePayloadTransport({ payload, bridge, executor }) {
  const serialized = JSON.stringify({ ...payload, executor });
  return { args: [bridge, '--payload-stdin'], stdinText: serialized };
}
