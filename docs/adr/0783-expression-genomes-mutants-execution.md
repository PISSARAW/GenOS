# ADR 0783 — Expression des génomes mutants pendant l'exécution

- **Statut** : Accepté
- **Date** : 2026-11-03

## Contexte

Les primitives de mutation persistaient des gènes cognitifs dans `lineage_nodes`.
Les chemins de création des workers réservaient pourtant l'expression du prompt
et la restriction des outils à une sélection AgentDNA. Le génome issu du
croisement de secours restait descriptif. Les paramètres `temp` et `topP`
n'étaient pas transmis jusqu'au fournisseur d'inférence.

## Décision

Le bootstrap autorise d'abord l'agent et vérifie son contrat de worker. Il charge
ensuite ses gènes de lignée dans le workspace autorisé. En l'absence de gènes
persistés, il utilise le génome du descripteur de lancement, notamment celui
d'AgentDNA ou du croisement de secours. Un génome persisté invalide provoque un
refus, sans remplacement silencieux par des valeurs par défaut.

`workerGenomeExpression` exprime le rôle, la stratégie et les instructions dans
le prompt. Les outils exprimés réduisent la lease existante par intersection ;
une liste vide reste vide. Le rôle exprimé ne remplace pas l'identité d'autorité,
le type de worker ni son contrat. Les gènes ne confèrent aucun droit nouveau.

Les lancements locaux, en processus ou en sous-processus, transmettent `temp`
et `topP` au routeur, puis au fournisseur. Les corps de requête compatibles
OpenAI portent `temperature` et `top_p` ; Ollama natif les reçoit dans `options`.
Les contrôles non pris en charge par un adaptateur produisent un refus explicite.
Les tours de modèle persistés conservent ces deux paramètres.
Le champ protobuf additif `genome_json` transporte les gènes exprimés vers les
sous-processus ; un test enfant vérifie ce passage par le véritable encodeur.

L'empreinte du phénotype exprimé est scellée dans l'enveloppe d'exécution.
Une substitution du génome après scellement est refusée. La parenté génétique
reste dans le DAG ; un mutant d'un worker gouverné conserve l'orchestrateur de
tutelle de ce worker. Une création de candidat n'autorise pas son lancement.

## Conséquences et limites

Ce raccord concerne les workers cognitifs. Une méthode native déterministe reste
pilotée par son contrat de méthode ; le génome cognitif de secours n'en réduit
pas les outils obligatoires. Le test de non-régression exécute réellement le
sous-orchestrateur natif avec son oracle de conformité.

La mutation change effectivement la configuration présentée à l'exécutant,
sans certifier une amélioration de qualité. Le test d'intégration crée un mutant
avec la primitive réelle, le recharge par le bootstrap autorisé, scelle son
exécution et observe les requêtes HTTP et réponses d'un fournisseur local
déterministe. Ce fournisseur est une fixture de test, pas un LLM entraîné.

Les exécuteurs externes qui ne donnent pas accès au sampling, notamment Codex,
reçoivent le prompt et les outils exprimés ; aucun contrôle de température ou
de `topP` n'est revendiqué pour ces exécuteurs. Les handlers MCP biomimétiques
de portée `metadata_simulation` conservent cette portée. Le cycle autonome de
reproduction de `Genome` Rust ne lance pas implicitement un worker LLM : son
génome doit passer par un chemin d'expression et un lancement autorisés.

Tests : `node backend/tests/test_worker_genome_execution.cjs` et
`node backend/tests/test_model_provider_sampling.js`.

## Alternatives

- Conserver les mutations uniquement dans les métadonnées : ne satisfait pas
  le contrat d'exécution des gènes cognitifs.
- Accorder directement les outils déclarés : élargirait les droits par mutation.
- Lancer automatiquement chaque mutant : confondrait création d'un candidat,
  autorisation d'exécution et promotion fondée sur des preuves.
