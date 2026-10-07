# Suivi du socle P1 — 2026-10-07

- **Statut** : P1 en cours ; provenance runtime Node et premières frontières communes d'autorité intégrées ; phase non clôturée.
- **Portée** : L01 à L05 et L22, après clôture P0 au périmètre convenu.
- **Dernière revue** : 2026-10-07.

## Source et critères

Le [programme de réalisation](https://chatgpt.com/space/page_f582a574b6d4819182c266e9d429d922)
fixe le chemin L00 → L01 → L02 → L03/L04 → L05 ; L22 dépend de L01 et L02.
La Page a été relue au démarrage. Sa note P0 du 6 octobre est historique ; la
[clôture locale P0](audit-p0-concepts-2026-10-06.md) et les rapports du 7 octobre
conservent les preuves ultérieures. Les six niveaux spécifié, implémenté,
intégré, qualifié, évalué et répliqué restent distincts.
Le [registre de clôture](obligations-cloture-p1.md) conserve les **115 entrées**
de P1, leurs fonctionnalités et leurs tests du catalogue. L'objectif actif
porte sur l'ensemble de cette phase, et ne se limite pas aux extensions L01.

| Lot | État de lancement | Travail suivant nécessaire |
| --- | --- | --- |
| L01 Contrats et provenance | Manifeste, cycle scientifique et liaison runtime Node intégrés ; lot partiel | Adapter les autres familles de reçus, poursuivre la propagation des rétractations et la compatibilité des consommateurs. |
| L02 Autorité et confinement | Enveloppe du run, revalidation et réservation de délégation Node intégrées ; lot partiel | Raccordement des appels directs, qualification complète des compteurs et confinement effectif. |
| L03 Oracles indépendants | Clôtures natives subset sum, fidélité mémoire et code arithmétique borné sous budgets distincts ; lot partiel | Couvrir projets code généraux, formats mémoire restants, vérité source et autres domaines ; qualifier tous les crashes et la propagation entre magasins. |
| L04 Mondes et replay | Replay procédural apparié avec source épinglée et aléas adressés observés ; lot partiel | Raccorder le nursery GVX, qualifier confinement, dépendances complètes, providers et bisection causale. |
| L05 Harnais et baselines | Pilotes P0 exploratoires disponibles ; campagne P1 à entreprendre | Runner GVX raccordé au manifeste, holdout inaccessible au candidat, coûts complets et puissance adaptée. |
| L22 Interfaces et observabilité | Clients de référence P0 qualifiés ; extension P1 à entreprendre | Inspection commune du manifeste, des coûts, preuves, rejets et reprises ; parité sémantique ciblée. |

## Première extension L01

L'[ADR 0349](../adr/0349-manifeste-experimental-gvx-et-provenance-p1.md)
étend `gvxExperimentProtocol` et le journal de développement existant. Le
manifeste `genos.gvx.experiment-manifest/v1` relie mission, run, claims,
hypothèses, interventions, versions, lignage, budgets et références d'artefacts
et de reçus. Les claims rejetés ou rétractés restent présents. Les déclarations
initiales ne peuvent pas porter un statut de vérification ou de support acquis.

Le plan v2 est persisté avant l'exécution des bras du nursery GVX. Sa clôture
refuse les changements de plan, de scope, de candidat et la rétrogradation vers
v1. Les résultats référencent son hash. Les plans anciens conservent leur
format et se lisent `legacy_unlinked` ; ils ne reçoivent aucune liaison fictive.

Le lecteur `readExperimentManifest(db, query)` prend `experimentId`, `scope`
et `entityId`. Il renvoie `linked`, `legacy_unlinked` ou null en absence de
plan dans ce scope. Le statut `linked` qualifie les relations et leur intégrité,
pas la vérité des claims ou une autorisation de promotion.

## Vérifications et limites

Exécuter `npm --prefix backend run test:p1-socle` pour les sondes L01 :
relecture dans un nouveau processus, altération de manifeste et de SQLite,
références inconnues, claims `verified` refusés, rejeu d'admission, changement
de plan, rétrogradation, scope étranger, succès sans preuve, migration
idempotente, compatibilité v1 et reprise du nursery.

Les quatre suites existantes `test_gvx_experiment_protocol`,
`test_gvx_experimental_nursery`, `test_gvx_development_ledger` et
`test_gvx_standard_cycle` passent après cette extension. Les sondes L01
passent également ; leurs bases sont temporaires et `.env` est désactivé.
La validation globale native termine également avec succès :

- `python scripts/ci/check_code_quality.py` : 5 387 fichiers, quatre violations
  historiques admises, **0 nouvelle**, code 0.
- `npm test` : code 0, avec découverte effective de `test:p1-socle`. Un poll
  après fermeture SQLite produit un avertissement dans la suite Garage,
  qui termine avec succès ; il reste conservé dans le journal.
- `cargo test --workspace` : **673 tests réussis, 80 suites, 0 ignoré**, code 0 ;
  compilation sur D: avec debug/PDB désactivé.
- Index ADR : 426 fichiers et lignes, zéro problème.

Les journaux, copie du programme, empreintes et `validation-summary.json` restent
hors Git sous
`C:/Users/Shadow/.codex/visualizations/2026/10/06/01a11128-3c02-7882-a146-5b1ec06e3434/p1-l01`.
L'état partagé inclut des changements d'autres travaux ; les fichiers propres
à L01 ont leurs empreintes capturées après validation, sans prétendre à un
snapshot atomique du dépôt entier.

Les versions, parents, artefacts et reçus sont des références déclarées,
avec hashes ; leur existence et leurs postconditions ne sont pas attestées
par le manifeste. Les tests du nursery utilisent un vérificateur réel
d'intégrité sur des bytes de fixture, sans oracle de succès métier ni modèle.
La reprise conserve un bras déjà committé ; aucun effet externe exactement
une fois n'est revendiqué. L01 complet, P1 complet et gain IA restent ouverts.

## Deuxième extension L01 — cycle scientifique

L'[ADR 0350](../adr/0350-cycle-immuable-des-claims-scientifiques.md)
ajoute au registre scientifique existant un historique immuable des rejets
et rétractations. Les preuves et assessments antérieurs restent lisibles.
Une rétractation est terminale et ne peut pas devenir une vérification.
L'inspection fournit le dernier hash à transmettre avec une transition.
Deux connexions qui proposent un successeur à ce même hash ne peuvent pas
le faire accepter toutes deux ; le perdant doit relire l'état, HTTP 409.
Le rejeu identique reste stable après une transition ultérieure.

Le nouvel endpoint REST hérite des contrôles de tenant et d'écriture.
Le contrôleur impose l'acteur authentifié et l'expérience de l'URL.
Le chemin des assessments reçoit également cette liaison : un claim
appartenant à une autre expérience est refusé, même si son identifiant est
connu. Les appels internes historiques sans expérience restent compatibles.
Les sondes de scope invoquent les contrôleurs sur SQLite réel ; elles ne
constituent pas une nouvelle qualification complète de l'authentification HTTP.

Trinity/Meristem refuse une nouvelle vague lorsqu'il observe un claim rejeté
ou rétracté, malgré un ancien assessment `verified`. Les artefacts déjà
consommés ne sont pas révoqués ; une rétractation pendant le scellement n'est
pas encore réservée atomiquement. Les manifestes GVX historiques conservent
leurs déclarations initiales et ne sont pas réécrits.

Validation de cette extension :

- Nouveau test `test_scientific_claim_lifecycle` : migration répétée sur
  données existantes, refus de scope et de transitions invalides, deux
  connexions concurrentes, rejeu, refus Meristem, restart dans un autre
  processus, immutabilité et altérations forcées ; code 0.
- Registre scientifique existant, suite runtime des capacités et manifeste
  GVX : codes 0.
- `npm test` : code 0, avec découverte des deux tests `test:p1-socle`.
- `cargo test --workspace` : code 0, 80 suites, compilation sur D: sans PDB.
- Qualité stricte des sept sources P1 : zéro violation ; index ADR :
  427 fichiers et lignes, zéro problème.
- Qualité globale : **code 1**, une nouvelle violation dans
  `crates/genos-mcp/src/validation.rs`, fonction `apply_special_validations`
  de complexité 11. Ce fichier était déjà modifié par un autre travail et
  reste hors du commit P1. La qualification globale de qualité n'est donc
  pas acquise pour l'état partagé observé.

Les journaux et empreintes restent hors Git sous
`C:/Users/Shadow/.codex/visualizations/2026/10/06/01a11128-3c02-7882-a146-5b1ec06e3434/p1-l01-claims`.
Le dernier ajout de sonde de migration a été rejoué après la suite globale ;
il ne modifie pas l'implémentation validée. Les empreintes locales ne sont
pas une attestation contre une réécriture complète par un administrateur.

La décision GenOS `decision-fb0fd128-6362-4861-b551-a9880babc9c3` a été
persistée. Deux appels de checkpoint ont dépassé 120 secondes sans reçu
ni fichier observé : cette continuation n'a pas de checkpoint GenOS vérifié.
L01 reste partiel, notamment pour les missions générales, la résolution des
reçus et la propagation des rétractations. L02 à L05 et L22 restent ouverts.
L'expérience GenOS `d45758b2-0dbb-4ffe-b8e7-e22e5a5ca13e` conserve les
résultats et ces limites ; sa persistance ne vaut pas validation du code.

## Troisième extension L01 — références runtime et consommateurs atomiques

L'[ADR 0351](../adr/0351-provenance-runtime-des-missions-et-references-gvx.md)
relie les missions et runs Node réels au journal GVX existant. La relecture
résout un reçu de procédure biologique exécutée, ses observations et coûts,
les bytes d'artefacts enregistrés, les claims scientifiques et le parent du
manifeste. Les anciens manifestes déclaratifs restent compatibles.

Une rétractation apparaît dans l'état courant sans modifier le manifeste
initial. La clôture GVX et le scellement Meristem vérifient puis publient
dans la même transaction que la barrière de rétractation. Les sondes retiennent
l'écriture SQLite réelle pour vérifier qu'une transition concurrente attend
la publication ; la relecture suivante observe ensuite le claim rétracté.
Cette réservation corrige la limite de concurrence décrite historiquement
dans la deuxième extension. Les artefacts déjà consommés restent historiques.

Validation native de l'état partagé :

- `npm test` : code 0 ; les quatre sondes `test:p1-socle` sont découvertes.
- `cargo test --workspace` et `cargo test -p genos-mcp` : codes 0.
- Qualité globale : 5 394 sources, quatre violations historiques,
  **zéro nouvelle**, code 0. L'extraction du dispatch Rust résout la nouvelle
  violation signalée à la deuxième extension sans augmenter la baseline.
- Index ADR : 428 fichiers et lignes, zéro problème.

Les journaux restent hors Git dans
`C:/Users/Shadow/.codex/visualizations/2026/10/06/01a11128-3c02-7882-a146-5b1ec06e3434/p1-full`.
Le checkpoint natif `snap-20dee92a791d4f0e948081b6763abaf1` a été créé et
son fichier observé après un timeout MCP. La décision
`decision-ebfc4f43-1980-4b1d-a52a-49fe2f501907` et l'expérience
`9707da85-8452-4c1e-89ab-be1d1d96ac91` conservent la portée et les résultats.
Cette persistance ne certifie pas les postconditions métier.

L'intégrité des références reste distincte d'un oracle indépendant :
`postconditions: not_evaluated`, promotion refusée par le lecteur. Les autres
familles de reçus, les versions déclarées, l'autorité commune, les holdouts et
les critères scientifiques restent à qualifier. L01 et P1 restent ouverts.

## Première extension L02 — enveloppe d'autorité runtime

L'[ADR 0352](../adr/0352-enveloppe-immuable-et-revalidation-de-lautorite-runtime.md)
scelle les permissions effectives du run dans le journal GVX. Cette enveloppe
est distincte des claims et reçus scientifiques. Les frontières de lancement,
de proposition locale, de décision d'orchestration et de publication relisent
scope, identité, membership, état de mission, autorité épistémique du lignage,
génération du token et échéance. Le token brut n'est pas publié.

Une publication refusée bloque le run et n'alimente pas une mémoire de succès
ni les effets suivants. La rotation d'autorité et la progression sont
transactionnelles. La sonde à deux connexions SQLite réserve une écriture
réelle pour vérifier la sérialisation entre publication et rotation. Un enfant
Node silencieux est arrêté par le monitor après rotation. L'enveloppe historique
et les reçus déjà produits restent consultables.

La sonde `test_mission_authority_envelope` passe également depuis le cwd
backend et relit l'enveloppe dans un nouveau processus. La suite workers
conserve ses 18 suites. Les fixtures historiques du cycle natif déclarent
explicitement l'absence de journal d'autorité ; elles ne remplacent pas les
sondes SQLite. Les tests ont détecté puis corrigé une lecture absente dans
cette fixture et un cwd non épinglé dans la reproduction enfant.

La décision `decision-edff4b1f-ee44-4af4-acde-144bf0c44332` conserve la portée
de cette extension. Le lecteur des consommateurs REST et des manifestes GVX
expose séparément l'enveloppe, son état actuel d'autorisation et
`postconditions: not_evaluated` ; il refuse un scope étranger.

Validation finale : `npm test` code 0, cinq sondes P1 et inspection REST
rejouées code 0, qualité globale 5 398 sources avec quatre violations
historiques et zéro nouvelle, index ADR 429 entrées sans problème. Le dernier
`cargo test --workspace` natif passe ; cette extension ne modifie pas Rust.
Les journaux sont conservés dans `p1-full`, dont les deux tentatives npm
échouées avant corrections. L'état partagé ne constitue pas un snapshot
atomique de tous les travaux du dépôt.

Le confinement OS, les appels REST/gRPC/MCP directs,
les compteurs de spawn/délégation et une qualification complète du bootstrap
positif sous enveloppe restent ouverts. Une mission sans réservation conserve
`lease: null` ; un run sans liaison reste `legacy_unbound`. Ces états ne sont
pas des preuves d'autorisation acquise. L02 et P1 restent ouverts.

## Extension L02 — délégation réelle et budgets réservés

L'[ADR 0353](../adr/0353-delegation-worker-bornee-et-admission-runtime.md)
raccorde le contrat de délégation bornée aux admissions Cedar, Garage et au
bootstrap du runtime. Le checkpoint natif observé est
`snap-5430b5826b58485f97b57d9851ba5e7f`. Le reproducer SQLite antérieur refusait
le parent worker avec `ORCHESTRATOR_REQUIRED`.

Le journal GVX réserve désormais les identités d'enfants et leurs plafonds
cumulatifs de jetons modèle dans la transaction de création. Un enfant
supprimé ne restitue pas sa réservation. La sonde à deux connexions vérifie
une écriture effectivement concurrente, l'attente, le refus du dépassement
et le rollback de l'enfant refusé. Ces réservations ne remplacent pas les
mesures d'usage ni un confinement de processus.

Le parcours natif réel crée sa capsule, exécute subset sum et publie le
témoin `[0, 2]` pour la somme 10, avec zéro jeton modèle. La promotion reste
refusée par `require_independent_verification`. Le refus est conservé dans
le reçu bloqué et la télémétrie ; une seconde publication ne masque plus
ce motif par `BIOLOGICAL_WORKER_RECEIPT_SEALED`. Un statut agent terminé et
un dossier ne suffisent pas à déclarer le dispatch réussi.

Le parcours positif sous oracle indépendant reste ouvert. Les copies de
workspace ne sont pas atomiques avec la réservation SQLite, l'idempotence
d'une requête complète et toutes les races de révocation ne sont pas
qualifiées. Les **115 obligations** restent dans le registre de clôture ;
cette extension ne clôture aucun lot et ne réduit pas P1.

Validation : la sonde native de délégation, `npm test` complet et
`cargo test --workspace` natif passent. Qualité globale : 5 401 sources,
quatre violations historiques, zéro nouvelle ; index ADR : 430 entrées sans
problème. La décision `decision-bef1bee4-43fc-4ae6-9615-5725ed595736` conserve
les choix et limites. Les journaux `delegation-qualified.log`,
`npm-delegation-final.log` et `cargo-delegation-complete.log` restent dans
`p1-full`, hors Git. Les échecs précédents sont conservés. Les changements
étrangers MCP/VFS/Rust du checkout partagé restent exclus de ce commit.

L'examen L03 a également reproduit une limite du prédicat de receipt seul :
une signature valide d'un vérificateur connu, datée de 2000 et portant sur
un autre résultat, satisfait ce prédicat. La sonde ne teste pas le gate
complet par défaut, qui impose aussi une assemblée AEIS liée aux résultats.
Cette observation exige un raccordement sémantique au run, aux entrées et à
la fraîcheur avant de déclarer un oracle natif qualifié.

## Extension L03 — premier oracle sémantique natif

L'[ADR 0354](../adr/0354-oracle-semantique-natif-et-sujet-runtime-scelle.md)
raccorde `procedure_semantic` au registre et au bridge AEIS existants. Le
sujet provient du contrat et de l'observation appliquée d'un run GVX réel,
avec contrôles de propriétaire, tenant, claim canonique, contenu et domaine.
Un bitset et une énumération exhaustive vérifient les postconditions subset
sum dans des processus et workspaces frais, sans importer le solveur.

La sonde réelle passe avec signature et assemblée AEIS. Les faux témoins,
faux négatifs, comptes erronés, modifications du résultat ou du scope et
preuves vieillies sont refusés. Les labels candidats ne peuvent pas fabriquer
l'indépendance de deux exécutions du même algorithme. Le dépassement du
domaine d'énumération, limité à vingt valeurs, reste explicitement inconclusif.

Ces receipts ne réécrivent pas le run historique bloqué. Le raccordement au
gate terminal et au manifeste, le nonce et la fraîcheur au point de décision,
les budgets d'ensemble, les oracles code et mémoire et les autres domaines
de raisonnement restent ouverts. Le checkpoint natif observé est
`snap-5a3a797b7432401286bce39905cd6136`. Le confinement OS n'est pas établi.
L03 et les **115 obligations de P1** restent ouverts.

Validation après intégration : `npm test` complet code 0, sonde native code 0,
qualité globale 5 407 sources, quatre violations historiques et zéro nouvelle,
index ADR 431 entrées sans problème. Le test a aussi contrôlé que deux labels
différents pour le même algorithme ne produisent pas deux stratégies
indépendantes. La décision `decision-bcc87e92-5f62-4b01-a55d-e75005aba9e4`
conserve ces limites. Le journal `npm-native-oracle-complete.log` et la sonde
`native-oracle-qualified.log` sont conservés hors Git dans `p1-full`.
Le workspace Rust a été validé dans cette continuation et n'a pas été modifié
par cette extension JavaScript. Les tests portent sur le checkout partagé ;
ils ne remplacent pas une reproduction indépendante du commit en clone frais.

## Extension L03 — clôture native et promotion différée

L'[ADR 0355](../adr/0355-cloture-native-par-oracles-budgetes-et-nonces-lies.md)
raccorde les deux oracles au gate terminal réel, avec une réservation durable
des processus et une échéance totale scellée dans l'enveloppe. Les receipts
signés portent le hash de réservation. Le service résout une référence de
preuve liée au run et au rapport ; il consomme les deux nonces au moment de
l'acceptation. Une approbation humaine obligatoire reste distincte.

La sonde native réelle passe pour la clôture par défaut et pour la promotion
différée. Elle refuse les références modifiées, un autre propriétaire, un
rapport changé, le replay, l'expiration, un budget insuffisant et un quorum
inconclusif. Deux connexions concurrentes ne créent pas deux allocations ;
un nouveau processus retrouve la même attestation. L'inspection conserve la
décision historique et expose séparément la fraîcheur actuelle. Les durées
sont mesurées, le coût local en dollars reste inconnu.

Le checkpoint natif de départ est `snap-3b4cc32205b5478fbb84d3dc4ddb32f5`.
Une allocation abandonnée avant attestation exige un nouveau run ; la reprise
transparente de tous les crashes et l'exécution de processus exactement une
fois ne sont pas qualifiées. Les oracles code et mémoire, les autres domaines,
les fronts directs, le confinement OS, les pilotes et la reproduction
indépendante du commit restent ouverts. Les **115 obligations** restent dans
le registre et **L01–L05 ainsi que L22 restent ouverts**.

Validation : `npm test` complet et `cargo test --workspace` passent avec
code 0. La sonde native complète passe également. Le gate qualité compte
5 418 sources, quatre violations historiques et zéro nouvelle ; l'index ADR
compte 432 entrées sans problème. Les journaux `npm-completion-final.log`,
`cargo-completion.log`, `native-completion-scope.log` et
`quality-completion-final.log` restent dans `p1-full`, hors Git. Les tentatives
échouées sont conservées. La décision
`decision-061aa9ce-1dda-4cd2-a2ad-0e6f56af9689` conserve le choix et ses limites.
Les résultats concernent le checkout partagé et ne constituent pas une
reproduction indépendante en clone frais. Les changements étrangers
MCP, VFS et Rust restent exclus du commit.

## Extension L03 — oracle de fidélité mémoire et lecture réelle

L'[ADR 0356](../adr/0356-oracle-memoire-de-promotion-et-controle-de-lecture.md)
ajoute un oracle mémoire au registre AEIS. Il confronte le contenu et les
claims du souvenir au rapport du journal de promotion signé, avec le run,
le tenant et l'assemblée source acceptée. Deux processus frais utilisent une
reconstruction et une lecture positionnelle du format attendu.

La sonde suit une promotion réelle, puis vérifie des receipts signés et
une assemblée AEIS. Le souvenir valide est retrouvé par la vraie recherche
mémoire ; les textes ajoutés et les claims contradictoires, même sous un
hash recalculé, sont réfutés et exclus de la lecture cognitive. L'inspection
affiche la fidélité séparément de l'intégrité. Le verdict conserve
`sourceTruth: not_evaluated` : fidélité de copie, vérité source et utilité du
souvenir restent trois questions distinctes.

Le checkpoint MCP observé est `snap-6b3ede21b806409e855303b1c80979c7`.
Le domaine couvre seulement les mémoires de promotion `Experience` à
références textuelles, sans contexte interprétatif. Les formats restants,
la rétraction source, les budgets durables et la clôture de vérification
mémoire, l'oracle code et les pilotes restent ouverts. Le périmètre conserve
les **115 obligations**, avec **L01–L05 et L22 toujours ouverts**.

Validation de cette extension : `npm test` complet, `cargo test --workspace`
et sonde native passent avec code 0. Le gate qualité relève 5 424 sources,
quatre violations historiques et zéro nouvelle ; l'index ADR compte
433 entrées sans problème. Les journaux `npm-memory-complete.log`,
`cargo-memory.log`, `native-memory-qualified-final.log` et
`quality-memory-complete.log` sont conservés hors Git dans `p1-full`.
La décision `decision-4c795363-5eac-436a-8647-fa61c58f542d` conserve le domaine
et ses limites. Les contrôles portent sur le checkout partagé ; la
reproduction indépendante du commit en clone frais reste ouverte.

## Extension L01/L03/L22 — rétraction des assurances sources

Le commit `09ca60e4` conserve l'oracle de fidélité mémoire. L'extension suivante,
décrite par l'[ADR 0357](../adr/0357-retraction-des-assemblees-et-memoires-derivees.md),
ajoute une rétraction signée durable et un endpoint HTTP protégé par
`security:manage` et le tenant en écriture. Le hash attendu lie la rétraction
à l'assemblée complète ; l'auteur vient du principal authentifié.

La sonde suit une vraie promotion native et sa recherche mémoire. Après
rétraction, les consommateurs refusent la source et excluent le souvenir.
L'inspection garde le run terminé et l'acceptation à l'instant de décision,
puis expose l'assurance actuellement retirée. Deux connexions concurrentes
retournent la même rétraction ; un processus frais la retrouve. Une reprise
modifiée, un autre tenant, un hash périmé ou une altération sont refusés.
La purge conserve l'assemblée rétractée. La sonde HTTP vérifie les vrais
middlewares et rejette un auteur forgé dans le corps.

Le checkpoint observé est `snap-6ff71c8dae914d8897c045c94bd878a5`. La propagation
automatique vers d'autres assemblées ou magasins mémoire et l'annulation des
effets passés restent ouvertes. Le journal ne prouve pas le contre-exemple
invoqué par l'administrateur et ne détecte pas le rollback de la base complète.
Les **115 obligations** et **L01–L05 ainsi que L22** restent ouverts.

Validation : `npm test` complet et `cargo test --workspace` passent avec code
0. Les sondes natives et HTTP passent. Le gate qualité compte 5 428 sources,
quatre violations historiques et zéro nouvelle ; les douze sources du commit
ne présentent aucune violation. L'index ADR compte 434 entrées sans problème.
Les journaux `npm-retraction-complete.log`, `cargo-retraction-complete.log`,
`quality-retraction-complete.log`, `native-retraction-concurrency.log` et
`http-retraction-first.log` sont conservés hors Git dans `p1-full`.
La décision `decision-37234378-e0ac-4601-857e-ce0e63c25d7c` conserve le choix
et les limites. Les validations portent sur le checkout partagé ; la
reproduction indépendante en clone frais reste ouverte.

## Extension L02/L03/L22 — run mémoire sous budget durable

L'[ADR 0358](../adr/0358-verification-memoire-native-sous-budget-durable.md)
raccorde `verify_memory_fidelity` au worker natif `verifier_worker`, à
l'enveloppe d'autorité et au journal commun des oracles. Le run vérifie une
mémoire persistée dans son tenant et une liaison attendue, avec sa propre
allocation de deux processus et son échéance totale. Le budget du producteur
n'est pas réutilisé. Les receipts lient séparément le run source et le run
de vérification, la mémoire, les bindings et l'observation du verdict.

La sonde part d'une promotion réelle et suit la nouvelle délégation,
l'assemblée, les deux nonces et la promotion différée. Deux connexions
concurrentes et un processus frais ne relancent pas le batch. Un budget
insuffisant n'alloue aucun oracle. Les mémoires contradictoires, faux verdicts,
rapports modifiés, expirations et sources rétractées sont refusés.

Le checkpoint observé est `snap-19c9e081e7984063928c6d97ded86909`.
Le batch direct conserve un budget local ; la réservation durable concerne
la méthode du run. Une réservation interrompue avant attestation exige un
nouveau run. La vérité source, l'utilité mémoire, les autres formats et
magasins, l'oracle code, les pilotes représentatifs et la reproduction
indépendante restent ouverts. Les **115 obligations** et les **six lots P1**
restent ouverts.

Validation : `npm test` complet et `cargo test --workspace` passent avec
code 0. Les sondes mémoire et subset sum passent ; le gate qualité compte
5 487 sources, quatre violations historiques et zéro nouvelle. Les dix-sept
sources du commit ne présentent aucune violation. L'index ADR compte
438 entrées sans problème. Les journaux `npm-memory-budget-complete.log`,
`cargo-memory-budget-complete.log`, `quality-memory-budget-complete.log`,
`native-memory-budget-qualified.log` et `native-domain-regression-first.log`
sont conservés hors Git dans `p1-full`. La décision
`decision-4ed161f3-bde3-43ad-af2f-72178482c232` conserve le choix et les limites.
Les checks portent sur le checkout partagé, après les merges Studio ; ils
ne constituent pas une reproduction indépendante du commit en clone frais.
La conservation des coûts sur toutes les exceptions après lancement et la
reprise de tous les crashes restent à qualifier.

## Extension L02/L03/L22 — coûts des refus et interruptions

Le commit `e278bac9` conserve la vérification mémoire sous budget durable.
L'[ADR 0359](../adr/0359-couts-durables-des-oracles-refuses-et-interrompus.md)
sépare les faits d'exécution de leur acceptation sémantique. Une intention
durable précède chaque lancement ; un fait final conserve son PID et sa durée.
L'inspection et le reçu biologique refusé conservent ces coûts après retrait
de source, nouveau rapport contradictoire ou expiration post-exécution.

La sonde arrêtant réellement le processus de contrôle après intention expose
une exécution non résolue et des totaux inconnus, puis refuse le relancement
dans un processus frais. Elle couvre cette fenêtre, sans qualifier les autres
crashes ni promettre une exécution exactement une fois. Une attestation
authentifiée qui omet un champ de coût est refusée sous une nouvelle
réservation. Les allocations historiques sans journal d'exécution restent
explicitement `legacy_untracked`.

Le checkpoint observé est `snap-f2e7df53964c4f3eb051f81e60fdacda` ; son fichier
local a été relu. Le coût local en dollars, les défaillances disque, les
processus orphelins, les autres formats mémoire, l'oracle code et les campagnes
représentatives restent ouverts. Les **115 obligations** et les **six lots P1**
restent ouverts ; ces contrôles ne constituent pas une reproduction indépendante.

Validation : `npm test` complet, avec découverte de la nouvelle sonde, et
`cargo test --workspace` terminent avec code 0. Le gate qualité compte
5 495 sources, quatre violations historiques et zéro nouvelle ; les vingt
sources préparées pour le commit passent le contrôle strict sans violation.
L'index ADR compte 439 entrées sans problème. Les journaux
`npm-oracle-cost-complete.log`, `cargo-oracle-cost-complete.log`,
`quality-oracle-cost-final.log` et `oracle-cost-final-receipts.log` restent
hors Git dans `p1-full`. L'avertissement du poll Garage après fermeture de
SQLite reste dans le journal de la suite réussie. La décision
`decision-cd66ed20-a915-4e5e-9637-4e8123c15526` conserve le choix et ses limites.
Les vérifications concernent le checkout partagé ; les modifications étrangères
MCP, VFS et Rust ne font pas partie de ce commit.

La poursuite après `69e9d07e` qualifie aussi l'arrêt du contrôle plane après
la fermeture réelle de l'oracle et avant le fait final. La sonde observe un
PID, un code de sortie zéro et un verdict `verified`, puis arrête le processus
de contrôle. Cette observation de test n'est pas ajoutée au journal de
production : le coût durable reste inconnu, le quorum absent et le relancement
refusé, y compris dans un processus frais. Le fichier du checkpoint
`snap-fe84d8a5704245a7a956d1479b66b3c0` a été observé. Ces deux fenêtres ne
qualifient pas les crashes pendant le processus ni toutes les reprises.

La nouvelle exécution complète de `npm test` inclut les deux sondes et termine
avec code 0. `cargo test --workspace` et le gate qualité passent également ;
les trois sources de cette poursuite sont sans violation en contrôle strict.
Les journaux `npm-oracle-postclose-complete.log`,
`cargo-oracle-postclose-complete.log` et `quality-oracle-postclose-complete.log`
restent hors Git dans `p1-full`, avec les traces du PID observé et du coût
durable inconnu. La décision `decision-d99a80d9-bbdf-4565-98cf-a107481cc7b3`
conserve la séparation entre observation de test et fait durable de production.

## Extension L02/L03/L22 — oracle code sur artefact scellé

Après `a36e5403`, l'[ADR 0360](../adr/0360-oracle-code-borne-sur-artefact-scelle.md)
ajoute la méthode native `verify_code_postconditions`. Elle lit un vrai fichier
`.gexpr` du workspace assigné et relie son hash au contrat versionné
`euclidean_modulo_v1`. Les deux processus frais couvrent les 264 couples
du domaine fini. Le run possède son propre budget durable, son observation
typée, son assemblée et son approbation réelle, reprise sans nouveaux nonces.

Les treize parcours de `test_native_code_completion.js` passent. Ils couvrent
les sorties zéro avec code faux et verdict forgé, le programme indisponible,
le fichier modifié après un processus, les entrées adverses et le budget
insuffisant. Une assemblée et un receipt authentifiés annonçant une couverture
d'un seul cas sont refusés au gate de promotion. Les coûts des deux processus
restent visibles et aucun nonce n'est consommé. La relecture dans un processus
frais retrouve exactement la même attestation ; une modification après
approbation invalide l'assurance actuelle sans réécrire la décision passée.

Les premières sondes ont été corrigées pour contrôler le refus structuré du
dispatcher et isoler chaque entrée invalide de sa capacité de délégation.
La relecture bloquante attend la fin du poll Garage, dont un verrou SQLite
empêchait une première tentative. Le journal `native-code-qualified.log`
conserve le passage complet après ces corrections. Le checkpoint
`snap-9b4ef6145afb4ffaaeba076fdffeb38e` a été relu localement avant les edits.

Le domaine est public et les deux stratégies partagent le même interpréteur.
Il ne qualifie ni des projets généraux, ni un holdout, ni un gain d'IA.
Le confinement OS complet et la reproduction en clone indépendant restent
ouverts. La clôture des **115 obligations** et des **six lots P1** reste ouverte.
Les changements MCP, VFS et Rust présents dans le checkout sont étrangers
à cette poursuite et sont exclus du commit.

L'approbation automatique a refusé `genos_record_decision` pour cette poursuite,
considérant la destination MCP non vérifiée pour les détails et chemins internes.
Cette décision distante n'a pas été persistée et aucun nouvel envoi n'a été
tenté. Le choix et les limites sont conservés dans l'ADR et dans les preuves
locales hors Git ; cette conservation ne certifie pas la validité des résultats.

`npm test`, `cargo test --workspace` et le gate qualité terminent avec code 0.
La suite complète découvre les treize nouvelles sondes. Le contrôle qualité
compte 5 511 sources, quatre violations historiques et zéro nouvelle ; les
25 sources du commit passent le contrôle strict. L'index ADR compte 440
entrées sans problème. Les journaux `npm-native-code-complete.log`,
`cargo-native-code-complete.log`, `quality-native-code-complete.log` et
`quality-native-code-staged.log` restent hors Git dans `p1-full`.
Le journal npm conserve un avertissement du poll SignalPlane après fermeture
de SQLite ; la suite termine néanmoins avec code 0. Ces résultats concernent
le checkout partagé, sans constituer une reproduction indépendante du commit.

## Extension L01/L02/L04 — replay apparié et dérivations actuelles

Après `7148e6f5`, l'[ADR 0361](../adr/0361-rejeu-apparie-avec-aleas-adresses.md)
introduit le protocole opt-in `genos.paired-replay/v2` dans les primitives
procédurales. Il épingle la source du runner réellement enregistré, le scope,
les snapshots, les bras et les événements futurs. Les tirages sont adressés
par seed, événement et slot ; un tirage supplémentaire ne décale pas les
événements suivants. Le runtime conserve les demandes observées dans le
checkpoint et le résultat, puis les relit lors de la reprise et du diff.

La sonde exécute douze forks sur deux snapshots et trois seeds. Elle localise
la première divergence du défaut injecté à l'index 1, reprend un checkpoint
dans un processus frais et confronte deux connexions sur un lease. Les
handlers d'analyse et de graphe relisent les preuves actuelles dans une
transaction ; une nouvelle observation fausse, malgré sa chaîne de hashes
cohérente, invalide aussi les dérivations mises en cache.

Les premières vérifications ont révélé une incompatibilité des paramètres
SQL multiples avec l'adaptateur historique ; le correctif conserve le format
tableau. Cette première sonde avait atteint la base par défaut et rencontré
un échec de sauvegarde par manque d'espace. La base par défaut est conservée ;
la nouvelle vérification historique utilise une base et des racines temporaires
explicites sur D:. Le fichier temporaire de la sonde échouée a été supprimé.

Les décisions restent locales, dans l'ADR et les preuves hors Git : le refus
antérieur de transmission de détails internes à GenOS n'a pas été contourné.
La copie locale de l'entrée agent `paired-replay-agent-local.json` est observée,
SHA-256 `C77D517346CCA99B5DBE8B492F2A70133BEFBA7130495AD544EC7EF0F4B924C7` ;
ce fichier n'est pas présenté comme un nouveau snapshot exécuté par GenOS.

La source textuelle ne scelle pas les closures ou tous les globaux. Le relevé
ne contrôle que `randomFor`, et son comptage ne couvre pas les appels perdus
après le dernier checkpoint d'un segment interrompu. Les limites
`causalGuarantee: false` et `runtimeAuthority: false` restent visibles jusque
dans les dérivations. Ces fixtures et leur bootstrap ne démontrent pas un
gain IA ou une campagne représentative. Bisection générale, confinement OS,
providers, coûts complets, nursery GVX et reproduction indépendante restent
ouverts. Les **115 obligations** et les **six lots P1** restent ouverts.

La dernière contre-épreuve refuse un diff sans adresse d'aléa commune
réellement observée, malgré deux forks achevés. `npm test` a été relancé après
ce correctif et termine avec code 0. `cargo test --workspace` termine aussi
avec code 0 ; aucune source Rust n'a changé entre ce passage et le dernier
correctif JavaScript. Le gate compte 5 520 sources, quatre violations
historiques et zéro nouvelle ; les 13 sources du commit passent le contrôle
strict. L'index ADR compte 441 entrées sans problème.

Les journaux `npm-paired-final-complete.log`, `cargo-paired-complete.log`,
`quality-paired-absence.log`, `quality-paired-staged.log`,
`paired-replay-absence-qualified.log` et
`paired-replay-legacy-auth-configured.log` restent hors Git dans `p1-full`.
La régression historique utilise une configuration administrateur de test
dans sa base temporaire, après une première relecture isolée qui signalait
une télémétrie non persistée faute de configuration. Le journal npm garde
l'avertissement du poll SignalPlane après fermeture de SQLite dans une suite
réussie. Les validations concernent le checkout partagé ; les modifications
étrangères MCP, VFS et Rust sont conservées et exclues de ce commit.

## Traçabilité initiale du lancement

GenOS a fourni le checkpoint `snap-a7d8f742186b41f18d02828f1ba16d1b`, dont le
fichier local a été observé, et la décision
`decision-fd091459-c12e-467c-ab5f-2de1259005fa`. Les échecs connus ont été
relus, notamment succès de transport sans mission attestée et contexte mémoire
suffisant sans retrieval. La persistance de ces traces ne valide pas les tests.

L'expérience `196f20f6-4057-40b3-8a98-0a5141aebc2d` a été enregistrée avec
les validations exécutées et les limites de cette extension.
