# API documentée — Bibliothèque de retry

## Interface

```
retry(operation: () => Promise<T>, options?: RetryOptions): Promise<T>
```

## Options

| Option | Type | Défaut | Description |
|--------|------|--------|-------------|
| maxAttempts | number | 3 | Nombre maximal de tentatives |
| delayMs | number | 1000 | Délai entre tentatives (ms) |
| backoff | 'fixed' \| 'exponential' | 'fixed' | Stratégie de backoff |

## Comportement

- Les erreurs non lancées par `operation` ne déclenchent pas de retry.
- Le dernier échec est propagé à l'appelant.
- Une fonction `isRetryable` peut filtrer les erreurs retentables.

## Limites

- Aucun test d'idempotence n'est documenté.
- Aucun scénario de panne partielle n'est couvert.