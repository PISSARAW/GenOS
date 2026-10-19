# Qualification ActionGenome et remédiation de sécurité — 2026-10-19

- **Date d'observation** : 2026-10-19
- **Révision observée au début de la revue** : `146291cc`
- **État Git** : workspace non propre ; résultats attachés à l'état observé, pas à une release immuable
- **Portée** : contrats, invariants et tests ciblés des deux verticales
- **Décision** : qualifiées dans leur périmètre borné, non qualifiées pour l'exécution ou la promotion

Ce rapport sépare la documentation de référence des preuves de qualification.
Il répond à trois questions : quelles revendications sont exécutables, quels
contrôles les soutiennent et quelles conclusions restent interdites.

## 1. Périmètre

### ActionGenome

Sont dans le périmètre :

- validation du schéma `genos.action-genome/v1` ;
- catalogue de l'action `syncytium.session.events@1.0.0` ;
- projections MCP, REST et CLI ;
- admission sur sept portes ;
- liaison à une révision Syncytium ;
- reçu causal déterministe ;
- exposition REST d'admission.

Ne sont pas dans le périmètre : exécution d'effet, postconditions, preuve de
résultat, compensation, signature et promotion.

### Remédiation de sécurité

Sont dans le périmètre :

- ingestion SARIF 2.1 et structurée ;
- borne, confinement lexical et déduplication ;
- clusters déterministes ;
- quatre familles de candidats ;
- mémoire négative exacte ;
- reçus de vérificateurs ;
- quorum, contrôle, qualification et classement ;
- projection de dossier et enrôlement des rejets.

Ne sont pas dans le périmètre : scanner réel, workspaces COW réels, génération ou
application de patch, exploit réel, identité cryptographique et promotion.

## 2. Protocole

Les contrôles sont exécutés depuis la racine du dépôt. Ils n'utilisent ni cible
live ni réseau. Les tests de sécurité reposent sur des données et fixtures sûres.

```bash
node backend/tests/test_action_genome_contract.js
node backend/tests/test_action_genome_invocation.js
node backend/tests/test_action_genome_projections.js
node backend/tests/test_action_genome_rest.js
npm --prefix backend run test:security-remediation
python scripts/ci/check_adr_index.py
```

Des contrôles documentaires complémentaires vérifient les liens locaux des trois
pages et l'absence d'erreur de whitespace dans les fichiers ajoutés.

## 3. Résultats ActionGenome

| Contrôle | Résultat observé | Revendication soutenue |
| --- | --- | --- |
| `test_action_genome_contract.js` | PASS | schéma strict, contrat publié et catalogue |
| `test_action_genome_invocation.js` | PASS | portes d'admission, refus et reçu causal |
| `test_action_genome_projections.js` | PASS | projections contrôlées et repli descriptif |
| `test_action_genome_rest.js` | PASS | routes, identité serveur, statuts 200/409/404 |

### 3.1 Propriétés qualifiées

1. Un génome invalide est refusé avant admission.
2. Une invocation ne peut ajouter des champs arbitraires.
3. Permissions, leases, deux budgets, version et préconditions ont des verdicts
   séparés.
4. L'admission n'est positive que si tous les verdicts passent.
5. Le reçu lie action, acteur, état, entrée et budget par contenu ou empreinte.
6. La route REST prend acteur et permissions dans le contexte authentifié.
7. Une admission refusée reste une réponse métier `409`, pas un succès masqué.

### 3.2 Conclusions interdites

Les tests ne prouvent pas :

- que l'outil MCP a été appelé ;
- qu'une sortie satisfait `outputSchema` ;
- qu'une postcondition a été observée ;
- que le budget réel a été respecté ;
- que le reçu est signé ;
- qu'une action admise est promouvable.

## 4. Résultats remédiation de sécurité

| Contrôle | Résultat observé | Revendication soutenue |
| --- | --- | --- |
| `test_security_remediation_ingestion.js` | PASS | ingestion, canonisation, borne et chemins |
| `test_security_antigen_graph.js` | PASS | regroupement déterministe et arêtes |
| `test_security_remediation_campaign.js` | PASS | familles, isolation déclarée et mémoire |
| `test_security_remediation_e2e.js` | PASS | contrôle, quorum, qualification et recommandation |

### 4.1 Propriétés qualifiées

1. Les lots vides, trop grands ou hors workspace sont refusés.
2. Les doublons exacts sont retirés sans perdre le décompte source.
3. Un même contenu canonique produit les mêmes fingerprints et clusters.
4. Chaque cluster reçoit un contrôle et trois familles d'intervention.
5. Une répétition exacte déjà mémorisée est marquée bloquée.
6. Le producteur ne peut pas signer son propre reçu de vérification.
7. Deux identifiants distincts au minimum sont requis.
8. Une intervention ne passe pas sans contrôle valide, scanner nettoyé,
   reproduction bloquée, invariants verts et absence de nouveau danger.
9. La recommandation reste `promotionEligible: false`.

### 4.2 Conclusions interdites

Les tests ne prouvent pas :

- que les clusters correspondent à de vraies causes racines ;
- qu'un workspace isolé a été créé ;
- qu'un scanner externe ou des tests réels ont tourné ;
- que deux identifiants sont réellement indépendants ;
- qu'une vulnérabilité exploitable a été supprimée ;
- qu'un patch a été appliqué ou promu.

## 5. Matrice revendication → preuve → confiance

| Revendication | Nature de preuve | Confiance | Condition de déclassement |
| --- | --- | --- | --- |
| schéma ActionGenome fermé | test unitaire + schéma partagé | élevée | AJV contourné ou schéma non chargé |
| admission liée à une révision | test service + REST | élevée dans le module | exécuteur ne revalidant pas l'état |
| reçu déterministe | tests d'empreinte | élevée pour le contenu | changement de canonisation |
| projection MCP prudente | test catalogue/lease | moyenne | catalogue de surface divergent |
| ingestion sécurité confinée | tests positifs/négatifs | élevée lexicalement | besoin de confinement filesystem réel |
| cluster reproductible | test déterministe | élevée | algorithme ou fingerprint modifié |
| cluster causalement juste | aucune preuve empirique | faible | ne doit pas être revendiqué |
| quorum logique | test E2E synthétique | élevée | identité externe non attestée |
| remédiation réelle | aucune exécution réelle | nulle | nécessite harnais isolé attesté |
| promotion sûre | porte externe non exercée | nulle ici | nécessite AEIS + promotion réelle |

## 6. Falsifications importantes

### Admission positive ≠ exécution

Le reçu ActionGenome conserve `evidenceStatus: pending_execution`. Cette valeur
falsifie explicitement la lecture « l'action a réussi ».

### Projection câblée ≠ appel MCP

`mode: invoke` indique la forme projetée. Le service de projection ne possède pas
de chemin d'appel vers l'outil.

### Capsule déclarée ≠ isolation observée

Le plan de remédiation contient `copy_on_write` et `network: disabled`, mais aucun
provisionneur n'est appelé par le planificateur.

### Hash ≠ signature

Les reçus des deux verticales utilisent des fingerprints de contenu. Aucun secret
ni clé de signature n'intervient dans ces fonctions.

### Recommandation ≠ promotion

L'adjudication publie simultanément `recommended: true` sur le candidat retenu,
`requiresExistingPromotionGate: true` et `promotionEligible: false`.

## 7. Risques résiduels

| Risque | Gravité | Traitement recommandé |
| --- | --- | --- |
| divergence entre admission et état d'exécution | élevée pour une future écriture | revalidation atomique ou jeton CAS |
| reçus falsifiables hors processus | élevée | signature et identité attestée |
| confusion projection/exécution | moyenne | conserver `admission_only` et `describe_only` explicites |
| regroupement causal erroné | moyenne | benchmarks annotés et falsification de clusters |
| faux quorum par identités déclaratives | élevée | identité de worker et provenance vérifiables |
| politique d'isolation non appliquée | critique si branchement à un exécuteur | provisionneur fail-closed + reçu de capsule |
| scanner/test non comparable au contrôle | élevée | protocole et environnement identiques |
| passage direct de recommandation à merge | critique | adaptateur obligatoire vers porte AEIS |

## 8. Critères de qualification du prochain niveau

### ActionGenome exécuté

- exécuteur isolé consommant le génome exact ;
- contrôle atomique de version juste avant effet ;
- mesure réelle du budget ;
- validation de sortie et postconditions ;
- reçu terminal signé ;
- compensation testée pour les effets non triviaux ;
- test E2E allant de REST à l'effet observable.

### Remédiation réelle

- provisionnement COW observé et réseau effectivement coupé ;
- même oracle reproductible pour contrôle et interventions ;
- scanner réel archivé avec version et configuration ;
- vérificateurs attestés et distincts ;
- corpus de vulnérabilités sûres avec vérité terrain ;
- mesure des faux clusters, faux correctifs et régressions ;
- intégration explicite à AEIS puis à la promotion transactionnelle.

## 9. Décision de qualification

Les deux verticales sont **qualifiées dans leur périmètre borné** :

- ActionGenome pour décrire, projeter et admettre une invocation ;
- remédiation immunitaire pour transformer des signaux synthétiques en campagne
  adjudiquée non promouvable.

Elles ne sont **pas qualifiées** comme moteurs d'exécution, de correction réelle
ou de promotion. Toute documentation ou interface qui franchirait cette frontière
sans les preuves de la section 8 doit être considérée comme incorrecte.

## 10. Références

- [ActionGenome](../03-reference/action-genome.md)
- [Remédiation de sécurité immunitaire](../05-securite-gouvernance/remediation-securite-immunitaire.md)
- [ADR 0651a](../adr/0651-action-genome.md)
- [ADR 0649](../adr/0649-campagne-immunitaire-remediation-securite.md)
- [Épistémologie et preuve](../01-concepts/epistemologie-et-evidence.md)
