# Registre historique Trinity L1

Ce générateur lit les trois audits scellés, le manifeste et `missions.json`. Il ne lance aucun worker, ne modifie pas les sources, n’ouvre aucune DB et ne publie pas les captures. Les hashes portent sur les octets des fichiers JSON, pas sur une réécriture canonique des sources. Le manifeste historique est épinglé par défaut au SHA-256 `c7bcf8ab4c786173aba0e7b9fc12ea4dc53ff2ecf024ab55c40b9c69a7fde6b4`.

Depuis la racine du dépôt, avec Python 3 :

```powershell
python scripts/trinity-evidence/registry.py --output .genos-agent-worlds/trinity-l1-20261006
python scripts/trinity-evidence/registry.py --output .genos-agent-worlds/trinity-l1-20261006 --verify-output
python -m unittest discover -s scripts/trinity-evidence -p 'test_*.py' -v
```

Si Python n’est pas dans le PATH, le runtime embarqué observé dans cette session est `C:/Users/Shadow/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`. Les options `--audit-root`, `--missions` et `--manifest-sha256` permettent une lecture déplacée ; un autre manifeste doit être approuvé et épinglé séparément. Aucun argument ne change les comptes canoniques CLI.

L’API Python est `registry.build_registry(config)`, puis `write_registry(payload, config)` ou `verify_output(payload, config)`. Le dictionnaire contient `auditRoot`, `missions`, `output` et facultativement `manifestSha256`. Les tests synthétiques utilisent `expected` pour une cohorte réduite ; ce paramètre n’est pas exposé par la CLI.

`index.json` scelle les fichiers produits. `missions.json` préserve les 48 textes originaux et leurs clauses, avec offsets Unicode en points de code `[start,end)`. La concaténation des clauses doit restituer chaque texte exactement. Cette segmentation lexicale n’est pas une interprétation des exigences : les critères, vérificateurs et preuves restent à compléter après revue humaine. Les obligations transversales et mécanismes proposés sont distincts des clauses originales et de la fixture ajoutée historiquement.

Les trois modules `mission_criteria*.py` proposent 3 à 6 critères concrets pour chacune des 48 missions, sans fournir les réponses attendues. La matrice lie ces propositions au texte original entier ; leur pertinence pour chaque clause doit encore être approuvée humainement. Les vérificateurs indiqués sont des propositions de revue, ou des contrôles existants explicitement limités à leur fixture. `proofRefs` reste vide et `status` reste `unknown`. `generatorSources.json` enregistre les hashes du code et des grilles ayant produit la sortie.

`attempts.json` inclut les cinq refus de composition heterogeneous dans les 88 tentatives, avec zéro monde créé pour ces refus. `workers.json` couvre les 324 mondes canoniques, sans inclure les pilotes hors cohorte. Les codes de sortie absents restent `null`/`unknown`. Les six sorties transport historiquement inconnues ne sont pas inférées depuis les états runtime.

`sources.json`, `references.json` et `referenceAliases.json` fournissent les chemins, pointeurs, hashes et alias par audit. Les références externes sont des hashes rapportés ; leurs fichiers ne sont pas relus ni attestés par cet outil. Les liens de claims sans catalogue restent dans `unresolvedReferences.json`, sans reçu inventé. `findings.json` et `answerLeakObservations.json` indexent les constats et risques via leurs sources sans copier réponses, prompts étendus ou logs. Ils demandent une revue, pas une nouvelle certification.

Les causes primaires désignent les premiers symptômes *rapportés par l’audit*. Elles ne prouvent pas une cause racine. Les arrêts finaux et cascades explicitement rapportées sont séparés ; absence de cascade rapportée signifie `non_observed`. Aucun ordre total n’est reconstruit à partir de logs non datés. Les routes fournisseur sont référencées telles qu’auditées, sans convertir une configuration ou une requête bloquée en inférence démontrée.

`validation.json` vérifie couverture, unicité, parenté, textes, offsets, pointeurs et comptes. Les 71 PASS sont des PASS historiques de fixtures, dérivés de trois schémas différents ; les booléens ne sont jamais assimilés au code de sortie entier zéro. Il n’y a aucune mission nouvellement qualifiée ni promotion obtenue par ce registre. `--verify-output` reconstruit tous les fichiers depuis les sources scellées et compare les octets : modifier le registre et son index ne suffit pas à forger un résultat.

Ce profil `genos.trinity-historical-registry/v1` est documentaire. Il n’est pas un contrat actif approuvé au format `trinity.qualification/v1` de `backend/src/services/trinityQualificationContract.js` : l’approbation des critères proposés et les références de vérification indépendante manquent encore. Les tests de ce dossier prouvent les propriétés du registre sur des données synthétiques, jamais le fonctionnement des variants Trinity.
