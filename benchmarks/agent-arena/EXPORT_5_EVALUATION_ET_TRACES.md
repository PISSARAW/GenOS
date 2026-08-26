# Évaluation objective et traces du workflow Mastra

### results/evaluation.json

```json
[
  {
    "agent": "autogen",
    "functional": {
      "compileError": false,
      "testPassed": 2,
      "testFailed": 0,
      "cargoTestGreen": true
    },
    "quality": {
      "clippyGreen": true,
      "clippyWarnings": 0
    },
    "security": {
      "constantTimePrimitive": false,
      "cryptographicHash": false,
      "strictInputValidation": false,
      "naiveSecretCompare": false
    },
    "performance": {
      "bench10kPresent": true,
      "reportedMeanMs": null
    },
    "complexity": {
      "loc": 22,
      "functions": 3,
      "avgCcn": 1.33,
      "maxCcn": 2
    },
    "deliverables": {
      "reportPresent": true,
      "reportBytes": 854
    },
    "aiMetrics": {
      "agent": "autogen",
      "model": "qwen2.5-coder:14b",
      "wallClockMs": 497120,
      "llmCalls": 14,
      "inputTokens": 516966,
      "outputTokens": 15421,
      "costUsd": 0,
      "termination": "CONSENSUS_ROUND_6"
    }
  },
  {
    "agent": "crewai",
    "functional": {
      "compileError": false,
      "testPassed": 2,
      "testFailed": 0,
      "cargoTestGreen": true
    },
    "quality": {
      "clippyGreen": true,
      "clippyWarnings": 0
    },
    "security": {
      "constantTimePrimitive": false,
      "cryptographicHash": false,
      "strictInputValidation": false,
      "naiveSecretCompare": false
    },
    "performance": {
      "bench10kPresent": true,
      "reportedMeanMs": null
    },
    "complexity": {
      "loc": 35,
      "functions": 5,
      "avgCcn": 1.4,
      "maxCcn": 2
    },
    "deliverables": {
      "reportPresent": true,
      "reportBytes": 965
    },
    "aiMetrics": {
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
  },
  {
    "agent": "langgraph",
    "functional": {
      "compileError": true,
      "testPassed": 0,
      "testFailed": 0,
      "cargoTestGreen": false
    },
    "quality": {
      "clippyGreen": false,
      "clippyWarnings": 1
    },
    "security": {
      "constantTimePrimitive": true,
      "cryptographicHash": true,
      "strictInputValidation": false,
      "naiveSecretCompare": false
    },
    "performance": {
      "bench10kPresent": true,
      "reportedMeanMs": null
    },
    "complexity": {
      "loc": 43,
      "functions": 8,
      "avgCcn": 1.25,
      "maxCcn": 2
    },
    "deliverables": {
      "reportPresent": true,
      "reportBytes": 903
    },
    "aiMetrics": {
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
  },
  {
    "agent": "metagpt",
    "functional": {
      "compileError": false,
      "testPassed": 0,
      "testFailed": 0,
      "cargoTestGreen": false
    },
    "quality": {
      "clippyGreen": true,
      "clippyWarnings": 0
    },
    "security": {
      "constantTimePrimitive": false,
      "cryptographicHash": false,
      "strictInputValidation": false,
      "naiveSecretCompare": false
    },
    "performance": {
      "bench10kPresent": false,
      "reportedMeanMs": null
    },
    "complexity": {
      "loc": 1,
      "functions": 1,
      "avgCcn": 1,
      "maxCcn": 1
    },
    "deliverables": {
      "reportPresent": true,
      "reportBytes": 912
    },
    "aiMetrics": {
      "agent": "metagpt",
      "model": "qwen2.5-coder:14b",
      "wallClockMs": 79914,
      "llmCalls": 4,
      "inputTokens": 35694,
      "outputTokens": 1576,
      "costUsd": 0,
      "sopArtifactsComplete": false
    }
  },
  {
    "agent": "genos",
    "functional": {
      "compileError": false,
      "testPassed": 3,
      "testFailed": 2,
      "cargoTestGreen": false
    },
    "quality": {
      "clippyGreen": true,
      "clippyWarnings": 0
    },
    "security": {
      "constantTimePrimitive": true,
      "cryptographicHash": true,
      "strictInputValidation": false,
      "naiveSecretCompare": false
    },
    "performance": {
      "bench10kPresent": true,
      "reportedMeanMs": null
    },
    "complexity": {
      "loc": 117,
      "functions": 19,
      "avgCcn": 1.11,
      "maxCcn": 2
    },
    "deliverables": {
      "reportPresent": true,
      "reportBytes": 1379
    },
    "aiMetrics": {
      "agent": "genos",
      "model": "qwen2.5-coder:14b",
      "wallClockMs": 315695,
      "llmCalls": 7,
      "inputTokens": 204516,
      "outputTokens": 8585,
      "costUsd": 0,
      "termination": "INTEGRATION_INCOMPLETE"
    }
  },
  {
    "agent": "mastra",
    "functional": {
      "compileError": false,
      "testPassed": 3,
      "testFailed": 0,
      "cargoTestGreen": true
    },
    "quality": {
      "clippyGreen": false,
      "clippyWarnings": 0
    },
    "security": {
      "constantTimePrimitive": false,
      "cryptographicHash": false,
      "strictInputValidation": false,
      "naiveSecretCompare": false
    },
    "performance": {
      "bench10kPresent": true,
      "reportedMeanMs": null
    },
    "complexity": {
      "loc": 52,
      "functions": 6,
      "avgCcn": 1.67,
      "maxCcn": 3
    },
    "deliverables": {
      "reportPresent": true,
      "reportBytes": 733
    },
    "aiMetrics": {
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
  }
]
```
### workspaces/mastra/.mastra/traces.jsonl

```json
[{"ts":"2026-08-26T09:10:47.001Z","spanId":1,"span":"state.persist","step":"spec","attempt":0},
{"ts":"2026-08-26T09:10:47.004Z","spanId":2,"span":"llm.start","step":"spec"},
{"ts":"2026-08-26T09:10:58.296Z","spanId":3,"span":"llm.end","step":"spec","durationMs":11291,"tokensIn":615,"tokensOut":224,"turns":0},
{"ts":"2026-08-26T09:10:58.299Z","spanId":4,"span":"state.persist","step":"parallel_implementation","attempt":0},
{"ts":"2026-08-26T09:10:58.299Z","spanId":5,"span":"llm.start","step":"impl_core"},
{"ts":"2026-08-26T09:11:11.876Z","spanId":6,"span":"llm.end","step":"impl_core","durationMs":13576,"tokensIn":2820,"tokensOut":602,"turns":2},
{"ts":"2026-08-26T09:11:29.844Z","spanId":7,"span":"verify.result","testsPassed":0,"clippyGreen":false,"testExit":101},
{"ts":"2026-08-26T09:11:29.845Z","spanId":8,"span":"branch.route","to":"fix","attempt":1},
{"ts":"2026-08-26T09:11:29.846Z","spanId":9,"span":"llm.start","step":"fix-1"},
{"ts":"2026-08-26T09:12:49.343Z","spanId":10,"span":"llm.end","step":"fix-1","durationMs":79497,"tokensIn":109782,"tokensOut":1254,"turns":18},
{"ts":"2026-08-26T09:12:50.039Z","spanId":11,"span":"verify.result","testsPassed":0,"clippyGreen":false,"testExit":101},
{"ts":"2026-08-26T09:12:50.039Z","spanId":12,"span":"branch.route","to":"fix","attempt":2},
{"ts":"2026-08-26T09:12:50.040Z","spanId":13,"span":"llm.start","step":"fix-2"},
{"ts":"2026-08-26T09:16:55.324Z","spanId":14,"span":"llm.end","step":"fix-2","durationMs":245284,"tokensIn":512676,"tokensOut":7754,"turns":50},
{"ts":"2026-08-26T09:17:05.201Z","spanId":15,"span":"verify.result","testsPassed":1,"clippyGreen":false,"testExit":101},
{"ts":"2026-08-26T09:17:05.201Z","spanId":16,"span":"branch.route","to":"fix","attempt":3},
{"ts":"2026-08-26T09:17:05.202Z","spanId":17,"span":"llm.start","step":"fix-3"},
{"ts":"2026-08-26T09:37:05.218Z","spanId":18,"span":"llm.end","step":"fix-3","durationMs":1200016,"tokensIn":543237,"tokensOut":21033,"turns":24},
{"ts":"2026-08-26T09:37:06.557Z","spanId":19,"span":"verify.result","testsPassed":1,"clippyGreen":false,"testExit":101},
{"ts":"2026-08-26T09:37:06.558Z","spanId":20,"span":"branch.route","to":"fix","attempt":4},
{"ts":"2026-08-26T09:37:06.558Z","spanId":21,"span":"llm.start","step":"fix-4"},
{"ts":"2026-08-26T09:55:10.285Z","spanId":22,"span":"llm.end","step":"fix-4","durationMs":1083726,"tokensIn":595196,"tokensOut":11967,"turns":50},
{"ts":"2026-08-26T09:55:12.721Z","spanId":23,"span":"verify.result","testsPassed":3,"clippyGreen":false,"testExit":0},
{"ts":"2026-08-26T09:55:12.722Z","spanId":24,"span":"branch.route","to":"fix","attempt":5},
{"ts":"2026-08-26T09:55:12.723Z","spanId":25,"span":"state.persist","step":"evals","attempt":5},
{"ts":"2026-08-26T09:55:13.938Z","spanId":26,"span":"evals.completed","score":46,"testsPassed":3,"clippyGreen":false,"hasBench":false},
{"ts":"2026-08-26T09:55:13.939Z","spanId":27,"span":"state.persist","step":"NOT_APPROVED_ATTEMPT_5","attempt":5}
]
```
