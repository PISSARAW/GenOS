# Studio — suivi de la parité

- **Statut** : Programme en cours ; aucune parité globale revendiquée.
- **Dernière revue** : 2026-10-07.

## F02 — Base et risques de consolidation

La reprise part du worktree propre `codex/studio-completion` à `6a3c7b6f`.
Son ancêtre commun avec `v3` est `b7e39894` ; `v3` est observée à
`ed9af6fa`. Le checkout principal contient des modifications opérateur
MCP/VFS et des fichiers non suivis. Il n'est ni restauré ni fusionné.

La branche isolée conserve les huit lots Studio. Cette décision ne signifie
pas que ses dépendances sont à jour avec tous les travaux de `v3`.

| Zone divergente | Risque | Stratégie avant intégration finale |
| --- | --- | --- |
| Studio HTML/JS/CSS et README | Main conserve un client différent, dont pagination | Adapter les parcours explicitement ; aucun remplacement aveugle |
| package.json backend et dépendances | Scripts et versions évoluent des deux côtés | Fusionner par clé, vérifier lockfile et installation |
| Fixtures B06 et productProofRoutes | Assertions main ne ciblent pas toutes les vues modulaires | Qualifier les parcours de cette branche ; réconcilier les deux harnais |
| consumerInspectionService et contrôleur | Pagination et contrat des listes évoluent | Choisir le contrat versionné après audit |
| CLI/env/runtime/VFS/MCP | Autorisation, timeout et exécution changent | Ne pas importer du dirty checkout ; requalifier au futur merge |
| ADR et index | Plusieurs documents 0348, nouveau 0349 dans main | Réserver 0350 Studio ; générer l'index sans renommer les chemins |
| Manifeste expérimental GVX | Main apporte des primitives utiles au laboratoire | Relier après qualification, ne pas créer un contrat concurrent |

Les commandes de diagnostic sont `git status --short`, `git log -8 --oneline`,
`git merge-base HEAD v3` et `git diff --name-only HEAD...v3`.
L'audit est un constat ponctuel : les autres travaux peuvent continuer.
L'intégration finale sera un point séparé, avec résolution et tests.

## Registre des points

| Point | État | Preuve / limites |
| --- | --- | --- |
| F01.1 Matrice | Livré : aad3bf6b | Tous les lots F/C/S recensés ; benchmark concurrentiel non exécuté |
| F02.1 Base isolée | Livré par ce document | Git inspecté, checkout opérateur conservé |
| F03.1 Contrats | Livré : ADR 0350 | Frontières UI/API/runtime, routes et sessions |
| F04.1 Harnais | Qualifié Windows | Port attribué par l'OS, origine exacte, résultat structuré ; Edge 154.0.4258.62, aucune erreur de page |
| F04.2 Contrat du benchmark | Qualifié par tests ciblés | Fixture positive vérifiée ; absence/échec/incomplétude refusés, service inchangé |
| F04.3 Contrat d'argumentation | Qualifié par tests ciblés | Invoker `context`, revue plate, identifiants persistés ; arguments et labels réellement assertés |
| F04.4 Gate élargi | Non qualifié | Échec du bridge d'organisation, reproduit isolément ; aucun contournement |
| C01.1 Navigation | Qualifié Windows | Connexion séparée, contexte compact, cinq routes, liens de run et historique |
| C02.1 Composants | Qualifié Windows, partiel | Fiches gestion/laboratoire, champs autorisés, inconnus et garanties fausses ; JSON secondaire |
| C02.2 Réponses et provenance | Qualifié Windows, partiel | Fiches de réponse, cible/sécurité de restauration et empreintes ; JSON replié, effacement à la déconnexion |
| C03.1 Responsive et clavier | Qualifié Windows, partiel | Cinq vues 390/1440 px, texte 200 %, labels et focus ; audit WCAG/lecteur d'écran non exécuté |
| C04.1 Onboarding | Qualifié Windows, partiel | Guide de première lecture, session vs sélection, repli automatique et état vide de lignée |
| Autres C/S | Planifiés / partiels selon matrice | Aucune clôture implicite |

## Limites de l'outillage

La recherche MCP GenOS des échecs antérieurs a réussi. Le checkpoint
`genos_snapshot` demandé avant les modifications a expiré après 120 secondes.
Le fichier `studio-parity-start.json` attendu dans la session est absent.
Ce checkpoint n'est donc pas une preuve acquise. La décision de base isolée
est persistée sous `decision-dbd96b47-212a-4d27-b3db-a2dc03f09d4b`, sans
promotion. Les commits et résultats exécutables restent les preuves locales.
L'activation effective des hooks n'est pas attestée.

## Preuves de la première tranche

F04 : `npm --prefix backend run test:studio:browser` a réussi sur la
base SQLite isolée, avec approbation réelle, refus tenant, reconnexion SSE,
conflit éditeur, restauration, protocole, rejeu et annulation.
Le démarrage Edge dans le sandbox Windows a échoué ; la relance autorisée
hors sandbox a réussi. Les artefacts sont sous
`.genos-tests/studio-parity-proof/`, jamais une preuve Linux.

Pour chaque point : vérifier qualité, exécuter les tests concernés, conserver
captures/versions dans un répertoire ignoré et mettre à jour ce registre.
Les gates obligatoires ont été réexécutés ; résultats ci-dessous.
Une validation Windows ne qualifie pas Linux/Docker ni un fournisseur réel.

F04.2/F04.3 : les deux fixtures historiques sont alignées avec les services
inchangés. La fixture biologique ne confond plus couverture sémantique et
vérification d'état. La fixture d'argumentation lit le contexte public, renvoie
la revue à plat et cible les identifiants persistés générés par le service.
Elle exige désormais une agrégation grounded, des arguments SUPPORT/ATTACK
persistés et des labels IN/OUT, avec une issue non résolue. L'absence
d'agrégation n'est plus un simple message de log suivi d'un succès.
Les jugements et reçus du vérificateur restent injectés pour ce test ; aucune
preuve de sécurité réelle ni indépendance de fournisseurs n'est revendiquée.

C01.1 : tests unitaires routes/client réussis et parcours navigateur enrichi
réussi sous Edge 154.0.4258.62 : historique avant/arrière, rechargement de lien
profond sans session, lecture après authentification, refus de run introuvable,
contexte tenant inchangé et absence de stockage de clé. Aucune erreur de page.
Le lien d'un workflow, d'un job ou d'un fichier sera qualifié avec son lot.

C01.2 : le navigateur normalise également les paramètres URL non supportés,
préserve la route lors du lien d'évitement et efface le run précédent sur
changement de scope. Test navigateur réussi avec une fausse clé dans l'URL,
jamais avec un secret réel. Le contrôle de session partagé réduit la
complexité de navigation sans modifier ses contrôles.

C02.1 : tests unitaires des projections réussis ; parcours navigateur réel
réussi avec inspection de job et comparaison depuis les fiches, inspecteur
technique fermé. Les autres sorties ont ensuite été traitées en C02.2.

C02.2 : réponses de gestion/recherche, provenance mémoire et restauration
utilisent les mêmes projections métier. Les champs de l'enveloppe restent
visibles même lorsqu'elle contient des listes ; snapshots cible, restauré et
de sécurité disposent de fiches distinctes. Tests unitaires et navigateur
réussis, dont réponse de protocole sans exécution, restauration physique et
effacement de toutes les nouvelles fiches à la déconnexion. Les diagnostics
d'exploitation et l'édition du dossier d'approbation restent techniques.

C03.1 : dix captures desktop/mobile et tests de largeur des cinq vues,
identifiant long, texte agrandi à 200 %, contrôle des labels et focus
du titre après navigation. Les colonnes et valeurs longues se replient.
Ce contrôle DOM ne remplace pas un audit complet d'accessibilité,
une vérification de contrastes ni un test avec lecteur d'écran.

C04.1 : projection unitaire du guide et parcours navigateur réussis.
Le guide distingue sélection renseignée, session authentifiée et dossier chargé.
Il ne lance aucun effet externe. Après première lecture il se replie ; les
diagnostics restent une action explicite de Gestion. Les templates exécutables
et le provisioning guidé seront des sous-points suivants.

Voir [la matrice](studio-parite-plan.md) et
[la qualification des huit lots](studio-qualification.md).

## Gates exécutés à la clôture de la tranche

| Commande | Résultat observé |
| --- | --- |
| `python scripts/ci/check_code_quality.py` | Exit 0 ; 5402 sources, 105 dettes existantes, aucune nouvelle violation |
| `npm test` | Exit 0, relance finale après les fiches C02.2 ; biologie/backend/garage |
| `cargo test --workspace --offline -j 1` | Exit 0 ; compilation et tests du workspace, avertissements existants |
| `npm --prefix backend run test:studio` | Exit 0 ; 11/11 suites sur win32 |
| `npm --prefix backend run test:studio:browser` | Exit 0 ; Edge 154.0.4258.62, cinq vues, erreurs de page vides |
| Tests benchmark biologique, argumentation et invocation de membres | Exit 0 ; services non modifiés |
| `npm --prefix backend run test:validation` | Exit 1 dans `test_dynamic_organization.js:109`, après dépassement des fixtures corrigées |
| `node backend/tests/test_dynamic_organization.js` | Exit 1 reproduit : sortie vide du bridge, parsing JSON impossible |

Les tests Node utilisent des bases par suite sous `.genos-tests/`, et les
fixtures de parcours créent leurs propres bases/workspaces temporaires.
Les lancements de sockets et Edge nécessitent l'exécution autorisée hors
sandbox Windows. Le target Rust existant du dépôt principal a servi de cache,
sans suppression de fichiers ni de caches tiers. L'échec initial de compilation
native en sandbox n'est pas compté comme un succès.

Dix captures desktop/mobile des vues, capture de navigation et reçu
`studio-qualified.json` sont dans `.genos-tests/studio-parity-proof/` (ignoré).
Les captures de laboratoire et d'inspection ont été inspectées visuellement.
Les avertissements de télémétrie SQLite dans certaines fixtures restent
visibles ; une suite réussie ne signifie pas que tous les logs sont exempts
d'erreurs. Aucun artefact généré, base ou secret n'est commité.

## Reprise

1. Fermer F04.4 : diagnostiquer le cycle d'entrée du bridge orchestration,
   dont `executeMission` est déclaré mais n'est pas appelé par le script
   observé ; qualifier sorties et refus sans lancer de mission opérateur.
   Ne pas remplacer la sortie vide par un succès ni désactiver le test.
2. Achever C02–C04 : formulaires typés, ergonomie des dossiers d'approbation,
   audit complet d'accessibilité, templates/provisioning guidés.
3. Passer à J2/C05–C12 : catalogue versionné, workflows, playground,
   prompts/modèles/outils/déclencheurs/RAG, avec preuves backend et UI.
4. Poursuivre J3–J7 selon la matrice ; benchmarks concurrentiels, domaines
   spécifiques et qualification Linux/Docker restent ouverts.
5. Auditer puis intégrer les divergences avec `v3` dans un point dédié ;
   aucune fusion ni push n'a été effectué dans cette tranche.

Le retour d'expérience GenOS est persisté sous
`ef2354db-2d43-408c-82dd-167fe3b81f47`. Il conserve les observations fournies,
sans les certifier ni accorder de promotion. Le programme global reste ouvert.
