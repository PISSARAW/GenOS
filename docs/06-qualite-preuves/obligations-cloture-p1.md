# Obligations de clôture P1

- **Objectif** : terminer L01 à L05 et L22, sans réduire la portée aux extensions déjà réalisées.
- **Sources relues** : [programme](https://chatgpt.com/space/page_f582a574b6d4819182c266e9d429d922) et [catalogue](https://chatgpt.com/space/page_5b78a1edf28481918630a902c5ee1b7f), le 2026-10-07.
- **Périmètre** : 115 des 649 références du programme. Les répétitions sont conservées et distinguées par leur ordre dans le catalogue.
- **État de ce registre** : obligations ouvertes ; les preuves P0 et les extensions P1 de provenance runtime et d'autorité doivent être confrontées à chaque obligation avant validation.

Le critère de sortie de chaque lot s'ajoute aux fonctionnalités et tests ci-dessous. Un test logiciel ou un hash valide ne constitue pas à lui seul une validation scientifique. Les traces d'exécution, résultats contradictoires, exclusions, coûts et limites doivent être conservés.

| Réf. | Concept | Lot | Fonctionnalité attendue | Test attendu | État |
| --- | --- | --- | --- | --- | --- |
| C001 | Runtime d’agents reproductible et supervisé | L04 | Replay avec environnement, outils et aléas capturés | **A** — Mesurer la reproductibilité malgré le non-déterminisme des modèles | À qualifier |
| C002 | État versionné | L01 | Versionner séparément croyances, permissions et état externe | **A** — Tester quelles composantes expliquent une divergence | À qualifier |
| C003 | Exécution contrefactuelle | L04 | Interventions sur une seule décision dans des mondes appariés | **A** — Estimer son effet causal sur la réussite | À qualifier |
| C004 | Branches, forks, snapshots, diffs et replay | L04 | Comparer forks et diffs avec aléas communs et contrôle des effets externes | **A** — Distinguer variation stochastique et effet du changement | À qualifier |
| C008 | Provenance | L01 | Construire un graphe des dépendances entre sources et décisions | **B** — Mesurer la propagation des rétractations | Partiel : rétraction signée d'assemblée vers lecture mémoire ; propagation générale et mesure comparative ouvertes |
| C009 | Reçus vérifiables | L03 | Lier reçus, entrées, versions et vérification sémantique | **B** — Détecter les preuves valides techniquement mais non pertinentes | Partiel : subset sum, fidélité mémoire et code arithmétique borné ; reçu signé avec couverture fausse refusé ; coûts durables et crash borné ; code général, vérité source et campagne comparative ouverts |
| C011 | Autorité explicite | L02 | Séparer autorisation d'agir et confiance dans une conclusion | **I** — Tester leur confusion sous ambiguïté | À qualifier |
| C012 | Leases d’outils | L02 | Adapter les leases au risque observé sans auto-augmentation de droits | **I** — Mesurer utilité et violations d'autorité | À qualifier |
| C014 | Isolation des workspaces | L04 | Contrôler les fuites de mémoire et d'information entre branches | **A** — Mesurer l'indépendance effective des expériences | À qualifier |
| C015 | Garde-fou fail-closed | L02 | Représenter explicitement inconnu, refusé et indisponible | **I** — Mesurer les faux blocages et fausses autorisations | À qualifier |
| C108 | Hypothèse | L04 | Générer plusieurs hypothèses avec prédictions discriminantes | **A** — Mesurer identification du mécanisme vrai | À qualifier |
| C184 | Self-Twin causal | L04 | Comparer un jumeau avec et sans souvenir ciblé | **A** — Estimer contribution causale d'une mémoire | À qualifier |
| C215 | Autorité de routage | L02 | Vérifier droits de transmettre et de déléguer séparément | **I** — Mesurer escalades d'autorité empêchées | À qualifier |
| C238 | Progrès causal | L04 | Attribuer les gains aux interventions plutôt qu'aux récits | **A** — Mesurer effet répliqué des découvertes | À qualifier |
| C240 | Simulation prospective | L04 | Comparer prévisions scellées et résultats de futurs réels | **A** — Mesurer validité prospective | À qualifier |
| C244 | Expérience discriminante | L04 | Planifier l'expérience maximisant séparation des hypothèses | **A** — Mesurer réduction du nombre de candidats | À qualifier |
| C260 | Blast radius | L02 | Estimer et borner le nombre de composants touchés par une faute | **I** — Mesurer propagation réelle des erreurs | À qualifier |
| C266 | Mission | L01 | Mission avec résultats observables et critères de réfutation | **B** — Mesurer adéquation objectif résultat | À qualifier |
| C267 | Tâche | L04 | Décomposer en tâches selon dépendances prouvées et incertitudes | **E** — Mesurer erreurs de décomposition | À qualifier |
| C268 | Run | L04 | Run conservant toutes les conditions de reproduction | **A** — Mesurer fidélité du replay | À qualifier |
| C269 | Workflow | L04 | Workflow adaptatif dont chaque modification est évaluée | **C** — Mesurer gain hors tâches de conception | À qualifier |
| C270 | Job | L04 | Job avec identité, effets et politique d'idempotence | **J** — Mesurer doublons après reprise | À qualifier |
| C271 | Graphe d’états | L01 | Vérifier invariants de sécurité et de connaissance par état | **I** — Mesurer transitions incohérentes | À qualifier |
| C272 | Transition | L01 | Transition accompagnée de préconditions et preuves de postconditions | **B** — Mesurer fausses transitions réussies | À qualifier |
| C278 | Branches d’exécution | L04 | Branches avec interventions enregistrées et effets isolés | **A** — Mesurer comparabilité expérimentale | À qualifier |
| C282 | Contrat de méthode | L01 | Méthode associée à prédictions et protocole de validation | **B** — Mesurer reproductibilité de la méthode | À qualifier |
| C283 | Contrat de stratégie | L01 | Stratégie évaluée contre ses garanties explicites | **B** — Mesurer violations des garanties | À qualifier |
| C284 | Contrat d’exécution | L01 | Contrat d'exécution contrôlé avant et après effets externes | **I** — Mesurer fausses attestations | À qualifier |
| C285 | Contrat de mission | L01 | Contrat de mission révisable avec validation de l'autorité | **I** — Mesurer dérive de périmètre | À qualifier |
| C294 | Checkpoint | L04 | Checkpoint séparant état interne et effets externes irréversibles | **A** — Mesurer reprise fidèle | À qualifier |
| C296 | Rejeu causal | L04 | Rejeu avec interventions et causalité explicites | **A** — Mesurer attribution de la divergence | À qualifier |
| C297 | Bisection causale | L04 | Bisection sur événements, hypothèses et changements d'environnement | **A** — Mesurer localisation de la cause | À qualifier |
| C300 | Capsule | L04 | Capsule avec dépendances, aléas et conditions de validité | **A** — Mesurer portabilité expérimentale | À qualifier |
| C301 | Workspace contrefactuel | L04 | Workspace avec journal des interventions et contrôle des fuites | **A** — Mesurer indépendance entre mondes | À qualifier |
| C302 | Git agentique | L04 | Associer chaque changement Git à hypothèse et preuve | **A** — Mesurer traçabilité des décisions de code | À qualifier |
| C303 | AgentGit | L04 | Fusionner code, mémoire et preuves avec détection de contradictions | **D** — Mesurer cohérence après merge agentique | À qualifier |
| C304 | Trajectoire | L04 | Comparer trajectoires complètes à résultat final identique | **A** — Mesurer coût, risque et mécanismes | À qualifier |
| C306 | Campagne d’évaluation | L05 | Préenregistrer une campagne avec tâches finales gelées | **B** — Mesurer robustesse et reproductibilité | À qualifier |
| C307 | Benchmark | L05 | Benchmark avec vérités terrain, variantes et perturbations cachées | **B** — Mesurer généralisation et contamination | À qualifier |
| C364 | Sandbox VFS | L02 | VFS traçant effets et testant confinement entre branches | **I** — Mesurer fuites et reproductibilité | À qualifier |
| C365 | Capsules/snapshots | L04 | Capsules portables avec dépendances et limites de replay | **A** — Mesurer reprise inter-hôtes | À qualifier |
| C369 | Observabilité | L22 | Observabilité reliée aux hypothèses et décisions | **K** — Mesurer pouvoir diagnostique des traces | À qualifier |
| C370 | Approbation de gouvernance | L02 | Approbation humaine ciblée selon valeur d'information | **I** — Mesurer erreurs évitées par interruption | À qualifier |
| C371 | Compliance | L02 | Contrôles exécutables liés aux règles réellement applicables | **I** — Mesurer violations et faux blocages | À qualifier |
| C499 | Causalité | L04 | Modèle causal avec interventions contrôlées et limites d'identifiabilité | **A** — Mesurer récupération des causes connues | À qualifier |
| C500 | Loi | L04 | Lois candidates avec prédictions et contre-exemples scellés | **A** — Mesurer généralisation hors observations initiales | À qualifier |
| C501 | Contrefactuel | L04 | Contrefactuels avec hypothèses structurelles et aléas appariés | **A** — Mesurer validité des effets prédits | À qualifier |
| C502 | Déterminisme | L04 | Rejeu distinguant déterminisme logiciel et stochastique des providers | **A** — Mesurer part reproductible des divergences | À qualifier |
| C504 | Temps B-series | L04 | Ordre temporel causal indépendant de l'horloge de lecture | **A** — Mesurer cohérence des traces distribuées | À qualifier |
| C509 | Monde possible | L04 | Définir mondes par états, interventions et contraintes explicites | **A** — Mesurer comparabilité des mondes | À qualifier |
| C510 | Accessibilité entre mondes | L02 | Calculer accessibilité sous conservation des invariants et permissions | **I** — Mesurer transitions possibles et interdites | À qualifier |
| C512 | Reçu de monde possible | L04 | Reçu de monde liant hypothèses, intervention et observations | **A** — Mesurer faux contrefactuels attestés | À qualifier |
| C513 | Dépendance causale | L04 | Propager impact des changements dans un graphe de dépendances | **A** — Mesurer précision des conséquences prédites | À qualifier |
| C523 | Autrui | L02 | Tester prise en compte d'un autre principal avec droits propres | **I** — Mesurer respect des engagements inter-agents | À qualifier |
| C524 | Identité | L02 | Identité distincte pour artefact, agent, rôle et principal | **I** — Mesurer mauvaises attributions | À qualifier |
| C529 | Non-promotion d’une analyse philosophique | L02 | Gate interdisant qu'une analyse philosophique crée autorité ou preuve empirique | **I** — Mesurer confusions de statut évitées | À qualifier |
| C531 | Causalité | L04 | Bibliothèque d'interventions sur graphes causaux | **A** — Mesurer identification et transfert des causes | À qualifier |
| C536 | Éthique | L02 | Contraintes éthiques opérationnelles avec arbitrages humains explicites | **I** — Mesurer violations et conflits de valeurs | À qualifier |
| C544 | Leibnizianisme | L04 | Explorer mondes possibles en conservant contraintes et causes | **A** — Mesurer couverture des alternatives | À qualifier |
| C551 | Contingence et événement | L04 | Modéliser événements rares et bifurcations de trajectoire | **A** — Mesurer couverture des changements inattendus | À qualifier |
| C558 | Mondes possibles | L04 | Modèles de mondes avec interventions, accessibilité et reçus | **A** — Mesurer validité des conclusions modales bornées | À qualifier |
| C561 | Adaptive Epistemic Immune System | L02 | Immunité épistémique évaluée aussi contre erreurs bénignes et inédites | **I** — Mesurer protection sans auto-immunité | À qualifier |
| C562 | API REST | L22 | API REST exposant manifestes et résultats expérimentaux versionnés | **K** — Mesurer reproductibilité inter-clients, prérequis technique | À qualifier |
| C563 | gRPC | L22 | gRPC avec contrats de causalité, deadlines et idempotence | **K** — Mesurer cohérence des expériences distribuées | À qualifier |
| C564 | MCP | L22 | MCP annonçant préconditions, preuves et portée des outils | **K** — Mesurer décisions correctes au-delà du transport | À qualifier |
| C565 | MCP stdio | L22 | MCP stdio avec tests de parité sémantique et leases | **K** — Mesurer divergence entre implémentations | À qualifier |
| C566 | CLI Rust | L22 | CLI Rust rejouant une expérience depuis son manifeste | **K** — Mesurer reproduction hors interface d'origine | À qualifier |
| C567 | Façade opérateur `g` | L22 | Façade g exposant hypothèses, coût et état des preuves | **K** — Mesurer erreurs opérateur | À qualifier |
| C568 | IDE `genos.ide/v1` | L22 | IDE reliant changements, hypothèses et résultats vérifiés | **K** — Mesurer vitesse et qualité de diagnostic | À qualifier |
| C569 | Studio | L22 | Studio comparant mondes et incertitudes sans masquer les rejets | **K** — Mesurer qualité de décisions humaines | À qualifier |
| C570 | TUI | L22 | TUI avec états épistémiques et obligations visibles | **K** — Mesurer compréhension sous contrainte d'affichage | À qualifier |
| C575 | Event log | L22 | Event log distinguant observation, intervention et décision | **A** — Mesurer fidélité du replay causal | À qualifier |
| C576 | MsgPack | L22 | MsgPack avec tests d'aller-retour et stabilité de schéma | **K** — Mesurer pertes de données, prérequis technique | À qualifier |
| C578 | Observabilité | L22 | Observabilité choisie selon hypothèses diagnostiques | **K** — Mesurer pouvoir diagnostique des traces | À qualifier |
| C579 | Logs d’audit | L22 | Audit liant effets réels aux principals et aux droits | **I** — Mesurer attributions incorrectes | À qualifier |
| C580 | Traces | L22 | Traces avec dépendances causales et contexte des modèles | **K** — Mesurer localisation des divergences | À qualifier |
| C581 | Spans | L22 | Spans incluant coût, incertitude et contribution décisionnelle | **K** — Mesurer utilité de l'instrumentation | À qualifier |
| C582 | Request IDs | L22 | Request IDs liés aux effets idempotents et à leurs reçus | **J** — Mesurer doublons externes | À qualifier |
| C583 | Trace IDs | L22 | Trace IDs préservés entre forks et délégations | **K** — Mesurer causalité reconstituable | À qualifier |
| C584 | Métriques par tenant | L22 | Métriques par tenant incluant qualité, risque et coût de preuve | **G** — Mesurer inéquité de ressources | À qualifier |
| C585 | Health checks | L22 | Health checks séparant vie du processus et qualité des décisions | **J** — Mesurer faux états sains | À qualifier |
| C586 | Readiness | L22 | Readiness conditionnée aux dépendances de preuve nécessaires | **J** — Mesurer démarrages prématurés | À qualifier |
| C587 | Alertes | L22 | Alertes évaluées sur utilité, précision et charge humaine | **F** — Mesurer incidents prévenus par interruption | À qualifier |
| C588 | Identité | L02 | Identités distinctes de principal, modèle et instance agentique | **I** — Mesurer erreurs de responsabilité | À qualifier |
| C589 | Autorité | L02 | Autorité attribuée et révoquée avec preuve de propagation | **I** — Mesurer usage après révocation | À qualifier |
| C590 | RBAC | L02 | RBAC complété par contexte et limites d'action vérifiés | **I** — Mesurer droits excessifs, prérequis technique | À qualifier |
| C591 | Scopes tenant | L02 | Scopes tenant propagés dans mémoire, signaux et preuves | **I** — Mesurer fuites entre tenants | À qualifier |
| C592 | Multi-tenant | L02 | Expériences d'interférence multi-tenant sous budgets partagés | **I** — Mesurer isolation et équité | À qualifier |
| C593 | Organisation | L02 | Contrats organisationnels liant responsabilité et délégation | **I** — Mesurer conflits d'autorité | À qualifier |
| C595 | Workspace | L02 | Workspace confinant effets, données et artefacts de branches | **I** — Mesurer contamination expérimentale | À qualifier |
| C596 | Mission | L02 | Autorité de mission limitée au périmètre et à la durée | **I** — Mesurer dépassements de mandat | À qualifier |
| C597 | Environnement | L02 | Attester environnement et changements de conditions | **A** — Mesurer preuves devenues hors contexte | À qualifier |
| C600 | Approbation humaine | L02 | Approbation présentant conséquence, incertitude et alternatives | **I** — Mesurer compréhension et erreurs humaines | À qualifier |
| C601 | Séparation des responsabilités | L02 | Séparer proposition, mesure, autorisation et promotion | **I** — Mesurer collusion et auto-approbation | À qualifier |
| C602 | Gestion du risque | L02 | Risque calibré sur probabilités, gravité et exposition | **I** — Mesurer prévisions de dommages | À qualifier |
| C603 | Compliance | L02 | Conformité par contrôles exécutables selon contexte applicable | **I** — Mesurer couverture et faux blocages | À qualifier |
| C604 | Auditabilité | L22 | Audit permettant reconstruction d'une décision et de ses alternatives | **K** — Mesurer fidélité par auditeurs indépendants | À qualifier |
| C605 | Conservation des preuves | L02 | Conserver preuves avec fraîcheur et possibilité de rétractation | **D** — Mesurer effets des durées de rétention | À qualifier |
| C606 | Gouvernance des données | L02 | Tracer collecte, transformations, usage et suppression des données | **I** — Mesurer conformité et contamination | À qualifier |
| C607 | Sandbox | L02 | Sandbox testée sur effets observables et canaux de fuite | **I** — Mesurer confinement réel | À qualifier |
| C608 | Isolation | L02 | Isolation incluant données, état, ressources et communications | **I** — Mesurer indépendance expérimentale | À qualifier |
| C609 | Confinement de chemins | L02 | Tests de chemins adverses et résolution canonique commune | **I** — Mesurer évasions, prérequis de sécurité | À qualifier |
| C610 | VFS sandboxé | L02 | VFS avec contrôle des capabilities et journal des mutations | **I** — Mesurer confinement des actions | À qualifier |
| C611 | Secrets | L02 | Références opaques aux secrets, révocation et tests de non-exposition | **I** — Mesurer fuites, prérequis de sécurité | À qualifier |
| C612 | CORS | L02 | CORS testé selon origines et authentification réelles | **I** — Mesurer accès inattendus, prérequis technique | À qualifier |
| C613 | Authentification | L02 | Authentification séparée de l'autorisation d'effet | **I** — Mesurer confusions de droits | À qualifier |
| C614 | SSO | L02 | SSO avec propagation des révocations et identité canonique | **I** — Mesurer erreurs d'attribution, prérequis technique | À qualifier |
| C615 | OIDC | L02 | OIDC testé contre confusions de principal et de tenant | **I** — Mesurer refus corrects, prérequis technique | À qualifier |
| C616 | SAML | L02 | SAML testé selon assertions et scopes réellement utilisés | **I** — Mesurer mauvaise fédération, prérequis technique | À qualifier |
| C617 | Cedar | L02 | Politiques Cedar confrontées à décisions effectives et contre-exemples | **I** — Mesurer erreurs du modèle d'autorisation | À qualifier |
| C618 | Permission explicite | L02 | Permissions explicites avec preuve d'application et retrait | **I** — Mesurer dérive des droits | À qualifier |
| C619 | Autorité de plateforme | L02 | Séparer les décisions de la plateforme des propositions des agents | **I** — Mesurer auto-augmentation d'autorité empêchée | À qualifier |
| C620 | Confirmation des actions destructives | L02 | Confirmation destructive liée à l'effet précis et à sa fraîcheur | **I** — Mesurer consentements mal appliqués | À qualifier |
| C648 | Mission → différenciation → contrat → lease → exécution isolée → observation → action bornée → reçus → preuve → falsification → décision → promotion rejet récupération ou fossilisation | L01 | Registre des transitions reliant l'état de chaque étape à la preuve requise, avec reprise et ablation de chaque contrôle | Injecter un défaut à chaque étape ; vérifier que la chaîne détecte, refuse ou récupère sans masquer le défaut | À qualifier |
| C649 | Un transport ou statut positif ne prouve pas une décision valide | L03 | Suite de faux succès avec transport réussi et postcondition métier fausse, preuves inadéquates ou contexte périmé | Mesurer les faux succès détectés, les bons résultats bloqués et le coût de validation | Partiel : code borné faux avec sorties zéro, verdict forgé, couverture signée incomplète et fichier périmé refusés ; taux sur campagne représentative ouvert |

## Preuves à réunir par lot

| Lot | Livrable et critère | Sources actuelles | État |
| --- | --- | --- | --- |
| L01 | Manifeste et liens entre reçus ; relecture dans un nouveau processus, altération détectée, compatibilité, faux succès refusé | ADR 0349 et 0350 ; manifeste GVX et cycle scientifique | Partiel |
| L02 | Enveloppe commune ; autorité, révocation, expiration, chemins et effets hors scope refusés ; permissions préservées et budgets contrôlés pendant le run | Autorité de mission, leases, sandbox et tests P0 à raccorder | Ouvert |
| L03 | Trois domaines ; postconditions réelles, séparation du candidat et de l'évaluateur ; domaine, fraîcheur et indépendance ; absence d'oracle explicite | Domaines natifs subset sum, fidélité mémoire et code arithmétique borné ; ADR 0360 ; généralisation et pilotes P0 à qualifier | Ouvert |
| L04 | Branches appariées, diff causal, replay et bisection ; versions/aléas, isolation, recherche de fuites, cause injectée localisée, effets externes non annulables | Snapshots, AgentGit, nursery et exécution GVX à étendre | Ouvert |
| L05 | Campagnes préenregistrées, datasets épinglés, acquisition/validation/test, baselines, ablations, coûts complets et statistiques ; holdout inaccessible ; puissance depuis données représentatives | Pilotes P0 et runner GVX à étendre | Ouvert |
| L22 | REST/gRPC/MCP/stdio/CLI/g/IDE/Studio/TUI sur le même état ; parité, logs reconstruisant les décisions, formats sans perte, état épistémique visible | Parcours B06 et inspection des consommateurs P0 à étendre | Ouvert |

Les résultats devront être ajoutés avec un chemin de preuve, la commande exécutée, la révision, le périmètre effectivement testé et la limite restante. Aucun lot n'est clos par le seul remplissage de cette table.
