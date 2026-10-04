# Pilote Inspect AI — comparaison externe

- **Statut** : interface exécutable ; aucun résultat de modèle ou de topologie n'est fourni.
- **Portée** : quatre tâches pilotes avec oracle déterministe, trois bras appariés.

Ce banc utilise [Inspect AI](https://inspect.aisi.org.uk/tasks.html) pour conserver
les échantillons, sorties et scores hors du runtime GenOS. Les quatre tâches
proviennent de `../topology-morphogenesis/comparison-task-set.json`. Leur score
est calculé par `../topology-morphogenesis/oracles.cjs`, appelé depuis le scorer
Inspect : le statut renvoyé par un worker ne décide jamais du verdict.

Les bras sont `model-alone`, `fixed-topology` et `morphogenesis`. Ils utilisent
le même modèle déclaré, la même limite de tokens, le même délai et une graine
dérivée de la tâche et de l'époque, sans inclure le bras. Une différence de
version du modèle ou du runner entre bras fait échouer le rapport apparié.

## Installer et lancer

```powershell
python -m pip install -r benchmarks/inspect-ai/requirements.txt
python benchmarks/inspect-ai/tests/test_protocol.py
python benchmarks/inspect-ai/run_comparison.py `
  --config C:/chemin/vers/config.json `
  --output artifacts/inspect-ai/comparison.json `
  --log-dir artifacts/inspect-ai/logs --epochs 3
```

Le fichier de configuration est un objet JSON :

```json
{
  "runner": ["node", "C:/chemin/vers/runner.cjs"],
  "modelId": "provider/model-versionne",
  "maxTokens": 512,
  "allowedTools": [],
  "timeoutSeconds": 120,
  "seed": 104729,
  "fixedTopology": "trinity"
}
```

Le runner est une commande explicite, sans shell. Il reçoit un objet JSON sur
stdin avec `schemaVersion`, `requestId`, `taskId`, `prompt`, `arm`,
`forcedTopology`, `modelId`, `maxTokens`, `allowedTools` et `seed`. Il doit écrire **un seul**
objet JSON sur stdout contenant les champs suivants :

```json
{
  "schemaVersion": 1,
  "requestId": "identique à la requête",
  "taskId": "identique à la requête",
  "arm": "model-alone",
  "modelId": "identique à la requête",
  "modelVersion": "version effective",
  "runnerVersion": "version du harness",
  "status": "completed",
  "topologyUsed": null,
  "rawOutput": "{\"remaining\":21,\"perGroup\":3,\"remainder\":0}",
  "tokensUsed": 80,
  "elapsedMs": 1200,
  "toolsUsed": [],
  "evidenceRefs": ["reçu:mission-et-appel-modèle"]
}
```

`topologyUsed` doit nommer la topologie exécutée pour les deux bras GenOS et
correspondre à `forcedTopology` pour le bras imposé. Une acceptation de dispatch,
une sortie non JSON, une preuve absente, une identité incohérente, un outil hors
de l'enveloppe commune ou un budget
dépassé arrêtent le run. Les références de preuve sont conservées mais leur
authenticité doit être auditée séparément. Le rapport conserve aussi le commit,
la propreté de l'arbre, les empreintes de la suite et de la configuration, les
logs Inspect et chaque bloc apparié. Son statut reste `experimental`.

`tests/fixture-runner.cjs` sert uniquement au smoke test. Ses réponses sont
codées en dur ; son rapport porte le statut `fixture` et n'est pas un résultat
de performance. Aucun runner réel multi-bras n'est livré dans ce lot : le banc
échoue fermé en son absence.
