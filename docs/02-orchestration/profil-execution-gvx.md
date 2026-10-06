# Profil d'exécution standard GVX

Le runtime standard utilise `gvxStandardLifecycleAdapters` lorsque le module personnalisé n'est pas configuré. Il développe uniquement une politique AGOW déclarative préapprouvée.

## Configuration

Service de vérification :

- `GENOS_GVX_EXECUTION_PROFILES_FILE` : fichier privé contenant un tableau de profils ;
- `GENOS_GVX_EXECUTION_PROFILES_SHA256` : hash exact de ce fichier ;
- `GENOS_GVX_EXECUTION_STORE` : répertoire privé persistant des mesures et des claims consommés ;
- `GENOS_GVX_VERIFIER_PRIVATE_KEY_FILE` et `GENOS_GVX_VERIFIER_TOKEN` : clé Ed25519 et jeton d'au moins 32 caractères.

Backend : `GENOS_GVX_RUNTIME_PROFILE_ID`, `GENOS_GVX_VERIFIER_URL`, `GENOS_GVX_VERIFIER_TOKEN`, `GENOS_GVX_VERIFIER_PUBLIC_KEY_FILE` (ou clé publique PEM), et éventuellement `GENOS_GVX_ARTIFACT_ROOT`. La clé privée et le répertoire d'exécution appartiennent au service externe.

Valider les profils et obtenir leur empreinte :

`node backend/bin/genos-gvx-profile.cjs chemin/profiles.json`

Le profil exige :

| Champ | Contrat |
| --- | --- |
| schema, id | `genos.gvx.execution-profile/v1`, identifiant stable |
| scope, agentId | Organisation, projet, entité et agent exacts |
| runtimeDatabaseFile | Chemin absolu de la base de contrôle AGOW, accessible en lecture au service externe ; les observations et claims recoupent opération appliquée et politique réelle |
| cwd, sources | Répertoire de l'évaluateur ; liste de chemins confinés et SHA-256 des sources de confiance |
| parentPolicy, candidatePolicy | Modes AGOW valides ; parent et candidat différents |
| model, maxSeconds, maxCost | Exécuteur déclaré, durée de 1 à 3600 secondes, coût positif maximal par bras |
| metrics, predictedMetrics, pathwayId | Métriques distinctes incluant safety, prédictions antérieures finies et voie cible |
| assessmentProfile | Profil conservateur, minSamples entier >= 3, règle safety/maintain sans régression, amélioration strictement positive d'une autre métrique |
| conditions.baseline, conditions.candidate | Même commande autorisée, même suite SHA-256 et même contexte |
| monitorConditions | Au moins trois conditions distinctes, chacune avec commande autorisée, suite et contexte SHA-256 distinct |
| allowedActions | Liste opérateur pouvant autoriser `gvx.somatic.apply` et `gvx.somatic.rollback` |

Les commandes passent la whitelist de `sandboxCommandPolicy`. L'évaluateur reçoit seulement le bras, la condition et la politique sous `GENOS_GVX_EVAL_ARM`, `GENOS_GVX_EVAL_CONDITION`, `GENOS_GVX_EVAL_POLICY`. Il produit exactement une ligne :

`GVX_MEASUREMENT_JSON:{"metrics":{"accuracy":[0,1,1],"safety":[1,1,1]},"cost":0.01}`

Ces valeurs doivent provenir des tâches réellement exécutées. Les séries contiennent au moins minSamples observations finies ; safety est bornée entre zéro et un. Le service matérialise un répertoire distinct par exécution à partir des seules sources déclarées, vérifie leurs hashes et le supprime après l’essai. GENOS_GVX_EVALUATION_WORKSPACE_ROOT peut définir une racine dédiée. Les dépendances nécessaires doivent figurer dans le manifeste. Le service relit les sources avant et après l’exécution, conserve les résultats signés et recalcule moyennes et effectifs. Le coût déclaré par l'évaluateur fixe est contrôlé contre le budget ; il ne remplace pas un compteur de facturation du fournisseur.

## Isolation

Le mode par défaut exécute du code fixe de confiance avec environnement minimal. Pour séparer aussi l'identité système sous Linux, ajouter `executionIdentity: {"uid":65534,"gid":65534}` au profil et activer `GENOS_GVX_REQUIRE_EXECUTION_IDENTITY=1` dans le service. L'UID doit être non nul et différent du signataire. La clé doit appartenir au signataire et être inaccessible au groupe et aux autres comptes. Le lancement échoue si ces invariants ne sont pas respectés. Le répertoire d'évaluation doit être lisible par cet UID ; le store et la clé doivent rester privés. Ce mode n'est pas disponible sous Windows.

Pour du code candidat hostile, déployer un exécuteur dédié avec confinement OS et accès réseau contrôlé. Le profil standard ne charge aucun code fourni par le candidat.

## Cycle et reprise

Un signal qualifié déclenche hypothèse, prédiction SelfTwin, paire de mesures, assessment vérifié, autorisation, application atomique, trois comparaisons de suivi, vérification longitudinale et crédit signé. Une régression déclenche la restauration exacte du parent et aucun crédit positif. Une interruption conserve les preuves et opérations ; retransmettre le signal reprend les étapes manquantes. Une modification des contrôles d'un cycle existant est refusée.

La consolidation exige trois reçus réussis distincts pour une voie et un contexte. Aucune promotion germinale automatique n'est ajoutée. Les fixtures de la suite GVX servent à vérifier ces contrats, pas à revendiquer une efficacité empirique.

Voir [ADR 0328](../adr/0328-cycle-standard-gvx-verifie-et-reprenable.md).
