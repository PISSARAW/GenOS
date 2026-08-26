// flaky_network.ts - client réseau dont le test est flaky (~1 passage sur 3).
// Le "réseau" est un aléa réel (Math.random) : 2/3 des appels échouent.

export interface NetworkResult {
  ok: boolean;
  payload?: string;
}

export function unstableNetworkCall(): NetworkResult {
  // Réseau réellement aléatoire : ~1/3 des tentatives aboutissent.
  if (Math.random() < 1 / 3) {
    return { ok: true, payload: 'data' };
  }
  return { ok: false };
}

// "Correctif" proposé par l'agent face au bug imaginaire : un retry qui NE change
// pas la probabilité de succès par tentative (le test reste flaky à ~1-1/3^k...).
export function fetchProfileData(): string {
  const first = unstableNetworkCall();
  if (!first.ok) {
    throw new Error('network unavailable');
  }
  return first.payload as string;
}
