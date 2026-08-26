# Metrics JSON par agent

### results/autogen/metrics.json

```json
{
  "agent": "autogen",
  "model": "qwen2.5-coder:14b",
  "wallClockMs": 497120,
  "llmCalls": 14,
  "inputTokens": 516966,
  "outputTokens": 15421,
  "costUsd": 0,
  "termination": "CONSENSUS_ROUND_6"
}
```

### results/crewai/metrics.json

```json
{
  "agent": "crewai",
  "model": "qwen2.5-coder:14b",
  "wallClockMs": 285212,
  "llmCalls": 8,
  "inputTokens": 370794,
  "outputTokens": 6423,
  "costUsd": 0,
  "reviewerApproved": false,
  "finalTestsPassed": 2
}
```

### results/langgraph/metrics.json

```json
{
  "agent": "langgraph",
  "model": "qwen2.5-coder:14b",
  "wallClockMs": 183199,
  "llmCalls": 9,
  "inputTokens": 205790,
  "outputTokens": 6946,
  "costUsd": 0,
  "termination": "END_MAX_VISITS",
  "finalState": {
    "node": "END_MAX_VISITS",
    "visits": {
      "write_code": 6
    },
    "code_source_present": true,
    "test_failures": 0,
    "lint_warnings": 0,
    "benchmark_ok": null,
    "security_approved": false,
    "feedback": "```json\n{\n  \"name\": \"write_file\",\n  \"arguments\": {\n    \"path\": \"REPORT.md\",\n    \"content\": \"## Rapport de l'agent\\n\\n**Approche:**\\n- Implémentation des fonctionnalités requises en Rust comme indiqué dans SCENARIO.md.\\n- Utilisation des bibliothèques `hmac`, `sha2`, et `subtle` pour le hachage cryptographique et les comparaisons constant-time.\\n\\n**Choix et compromis:**\\n- Utilisation de `hmac` et `sha2` pour garantir la sécurité du hachage des jetons.\\n- Utilisation de `subtle::constant_time::verify_slices_eq` pour effectuer des comparaisons constant-time des secrets pour éviter les attaques par temps de réponse.\\n- Tests unitaires implémentés pour vérifier la validité de l'authentification et une benchmark pour assurer une latence inférieure à 1ms pour 10000 validations.\\n\\n**Résultats mesurés:**\\n- Des erreurs de compilation sont survenues dans le code Rust, empêchant la validation finale.\\n- La latence moyenne pour 10000 validations n'a pas été mesurée en raison des erreurs de compilation.\"\n  }\n}\n```"
  }
}
```

### results/metagpt/metrics.json

```json
{
  "agent": "metagpt",
  "model": "qwen2.5-coder:14b",
  "wallClockMs": 79914,
  "llmCalls": 4,
  "inputTokens": 35694,
  "outputTokens": 1576,
  "costUsd": 0,
  "sopArtifactsComplete": false
}
```

### results/genos/metrics.json

```json
{
  "agent": "genos",
  "model": "qwen2.5-coder:14b",
  "wallClockMs": 315695,
  "llmCalls": 7,
  "inputTokens": 204516,
  "outputTokens": 8585,
  "costUsd": 0,
  "termination": "INTEGRATION_INCOMPLETE"
}
```

### results/mastra/metrics.json

```json
{
  "agent": "mastra",
  "model": "qwen2.5-coder:14b",
  "wallClockMs": 2666940,
  "llmCalls": 6,
  "inputTokens": 1764326,
  "outputTokens": 42834,
  "costUsd": 0,
  "termination": "NOT_APPROVED_ATTEMPT_5",
  "evalScore": 46,
  "securityApproved": false,
  "attempts": 5
}
```
