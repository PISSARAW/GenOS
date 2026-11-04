# Compétence native : scopes, graphe de vérité et contrôle d'induction

État de qualification au 4 novembre 2026. Les corrections de code et une preuve de progression
après cent observations sont deux résultats distincts. Le commit d'implémentation est
`02d3a377353850d550aead5e889f30f1b7b79bf3`, complété par `52ec7ce8be876e59b468f1da2264e65698d47d3b` ;
les essais de qualification sont conservés sur D:.

**La nouvelle campagne à cinq variantes n'est pas encore autorisée par son contrôle positif.**
Le contrôle `c29` retrouve les douze résultats privés et vérifie les trois workers, mais sa
clôture échoue et son ledger omet des inférences auxiliaires. Le contrôle frais `c33` qualifie
les corrections de clôture et la comptabilité renforcée sur un runtime scellé correspondant.
Aucun score historique v1/v2 n'a été changé et aucune progression nouvelle n'est présumée.

## Ce qui a été corrigé

Le bootstrap conserve le workspace existant et attribue une identité stable à chaque autre
racine canonique. Un changement de tenant reste refusé. La forme canonique Windows est celle
attendue par la recherche exacte du client MCP.

Les workers et le graphe de vérité utilisent la mission scellée `mission_*`. L'identifiant
`trinity_*` reste un identifiant d'expérience comparative. Les vérifications de membership,
de tenant et de liaison run/mission sont conservées. Une mission locale explicitement
multiworker ne passe plus par le raccourci monoworker, même avant l'allocation du plan.

Le modèle local, son contexte, les limites d'inférence et la désactivation du rappel optionnel
atteignent les workers. L'alias public `worker_assignments` conserve les méthodes affectées
aux vrais rôles Trinity. Les champs de preuve de la méthode font partie du schéma demandé
au fournisseur ; les exigences propres à chaque type de worker restent actives.

Un nouvel oracle natif `bounded_function_induction` vérifie les programmes numériques :
deux processus isolés contrôlent les exemples publics et l'identifiabilité dans la classe
finie déclarée. Le sujet lie contrat scellé, sortie brute, worker, run et usages fournisseur.
Les requêtes privées et leurs réponses ne sont pas accessibles à ces vérificateurs.

Le prompt numérique est compilé depuis le contrat scellé, avec l'identité et le rôle
opérationnels. Il conserve toutes les observations publiques. Les biographies et exemples
génériques de rédaction ne sont pas transmis à cette primitive ; les obligations d'équipe
et les réparations qualité explicites restent ajoutées. Le prompt exact est journalisé.

Le scellement du runtime associe sources, binaires Rust réellement compilés et exécutable
Node. Le lanceur expérimental fixe aussi `GENOS_ORCHESTRATOR_BRIDGE` : une valeur héritée
sélectionnait autrement le checkout C: malgré la copie D:. Les essais concernés ne certifient
pas l'exécution du runtime figé annoncé.

Voir l'[ADR des scopes et des preuves](../adr/2026-11-04-scope-et-preuves-des-experiences-de-competence.md).

## Contrôles et échecs conservés

Le contrôle d'induction crée six fonctions privées, deux par famille : affine, quadratique,
et affine avec une charnière en cinq. Les coefficients entiers sont compris entre −3 et 3.
Six entrées publiques par fonction sont fournies, sans les coefficients. Deux opérateurs
supplémentaires testent l'ambiguïté et l'absence d'observations.

L'acceptation exige douze résultats privés corrects, trois workers acceptés par les oracles
et les reçus biologiques, un graphe mesuré, une mission réussie, le modèle épinglé et des
usages mesurés complets. Chaque worker doit déclarer lui-même les deux cas d'ignorance.
Les formules de différences finies sont publiques : il s'agit d'induire de nouveaux
coefficients dans une classe connue, pas de découvrir cet algorithme.

| Essai | Observation | Interprétation |
| --- | --- | --- |
| `c11`, `c12` | Vrais appels Qwen 14B ; programmes incorrects et fausse certitude. | Développement négatif ; l'ancien environnement hérité ne qualifie pas le runtime figé. |
| `c14`, `c15` | Vrais appels Mathstral ; problèmes de schéma puis programmes et ignorance incorrects. | Un schéma JSON valide ne prouve pas l'induction. |
| `c18` | Neuf appels Qwen3.5 atteignent chacun 4 096 tokens de sortie. | Sorties tronquées ; aucun contrôle positif. |
| `c19` | Échec avant inférence : bridge hérité vers C:, disque plein. | Défaut d'isolation, pas erreur mathématique du modèle. |
| `c20` à `c23` | Processus interrompus sans résultat final. | Essais incomplets. L'utilisateur confirme un nettoyage simultané ; le journal ne fournit pas l'auteur de chaque arrêt. |
| `c24` | Six appels Qwen3.5 sans raisonnement ; graphe mesuré ; contrôle refusé. | Échec sémantique confirmé séparément en Python. |
| `c25` | Raisonnement réactivé, plafond de 8 192 atteint ; usage partiellement inconnu après délai. | Ni réponse complète certifiée ni comptabilité complète. |
| `c26` | Aucun appel LLM : minimum de 100 000 tokens incompatible avec les plafonds des rôles. | Refus d'admission correct ; configuration expérimentale corrigée. |
| `c27` | Un worker retrouve les six fonctions et les deux cas d'ignorance ; son oracle accepte. Le contrôle reste à 2/12. | Le reçu réappliquait la porte de promotion ; un autre worker expirait à neuf minutes et un troisième dupliquait un opérateur. |
| `c28` | 12/12 résultats privés, mais un appel expire au bout de quinze minutes avec usage inconnu ; toutes les déclarations requises ne sont pas disponibles. | Contrôle refusé, malgré les bons programmes des deux premiers workers. |
| `c29` | 12/12 résultats privés, trois workers et six étiquettes d'ignorance vérifiés ; clôture parent refusée. | Échec natif de clôture, plus inférences auxiliaires absentes du ledger. |
| `c30` | Le run parent termine après séparation de la complétion et de la promotion. | Le superviseur reste non vérifié et le poller attend des mondes déjà comparés ; la comptabilité auxiliaire reste insuffisante. |
| `c31` | Deux workers acceptés et une proposition refusée par l'oracle, puis reprise. | Essai interrompu après export des reçus : implémentation de clôture remplacée et file d'inférence partagée avec c32. |
| `c32` | Contrôle sur `r33` démarré pendant la fin de c31. | Essai volontairement interrompu avec reçus et motif conservés pour sérialiser les qualifications sur l'unique créneau. |
| `c33` | Même runtime `r33`, après constat d'un serveur libre. | Qualification en cours ; aucun résultat favorable n'est présumé. |

Le serveur local utilisé ne prend pas en charge les requêtes parallèles pour l'architecture
Qwen3.5. Le lanceur a refusé une configuration déclarant trois créneaux ; la configuration
retenue en annonce et en mesure un seul. Trois workers GenOS ne signifient donc pas trois
inférences GPU simultanées. Les autres modèles actifs et le nettoyage sont des facteurs
matériels à conserver dans les limites de cette qualification.

La [fiche officielle Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B/blob/main/README.md)
recommande une sortie de 32 768 tokens pour la plupart des requêtes. Ce conseil ne modifie
pas les politiques GenOS : les workers bornés et spécialistes gardent leur plafond de
20 000 tokens, prompt compris. Le contexte de 49 152 tokens n'accorde aucun budget supplémentaire.
Le plafond effectif de sortie avant qualité est enregistré dans `FUNCTION_INDUCTION_PROMPT`.

## Analyse vérifiée de c24

Mission canonique : `mission_83c7e654-b7e6-4aad-98cc-d20636111a1d`.
Manifeste : `b9968c1e816fe6ce21a54ae905c10448abe74cabd92f410252657d1f794efe61`.
Le modèle est `qwen3.5:9b`, digest
`56671c2ab9385f9cfcb404638e32cd62d88e3501d44822208363c010179a3c90`.

Les six appels ont consommé **5 642 tokens d'entrée et 5 916 de sortie**, mesurés par le
fournisseur. Le coût physique local n'est pas chiffré. Dans leurs dernières déclarations,
chacun des trois workers retrouve **1 fonction sur 6** et **1 étiquette d'ignorance sur 2**.
Les calculs Python séparés reproduisent ces échecs sur les exemples publics.

Le score final de c24 est **2/12**, obtenu uniquement par les gardes d'abstention : aucun programme
natif refusé n'est admis comme réponse. Ce score ne constitue donc pas une induction réussie.
Les événements `AGENT_COMPLETED` présents dans les traces ne remplacent pas les reçus
sémantiques : les dernières exécutions des trois workers sont bloquées et leurs oracles refusent.
Le graphe est mesuré et la porte de rapport rejette les affirmations de succès non étayées.

La récupération conserve ses échecs : dans c24, les tentatives avec la même identité
s'exécutent, mais les remplacements réutilisent le workspace Trinity de l'ancien worker
et échouent sur `AGENT_WORKSPACE_MISMATCH`. Le correctif ultérieur crée une capsule privée
depuis le snapshot scellé et transfère le même monde vers la nouvelle identité dans une
transaction. Le test vérifie le démarrage autorisé, la lignée et le rollback face à un
snapshot altéré. Il ne transforme pas les reprises de c24 en succès historiques.

## Deux blocages natifs isolés dans c27

Le run `strategy_run_1793824486147_df95e0af` retrouve les six fonctions publiques et les
deux étiquettes d'ignorance. Deux vrais processus d'oracle l'acceptent ; le run est terminé.
L'appel consomme 936 tokens d'entrée et 10 792 de sortie. Son reçu biologique reste pourtant
non vérifié avec `promotionReason: require_replay`. Le reçu confondait le succès d'une
complétion avec l'autorisation de promouvoir. Le correctif conserve ce refus de promotion
et exige toujours une preuve sémantique native pour la complétion.

Un autre worker expire après 538 997 ms malgré l'enveloppe parent de 28 minutes : fleet
omettait la durée explicite lors du scellement du contrat. Le contrat persisté reçoit
maintenant l'allocation validée. Les plafonds de ressources restent appliqués.

Le troisième worker propose des coefficients corrects, mais répète un opérateur et omet
le cas ambigu. Le nouvel encodage `operator-keyed/v1` exige chaque identité une seule fois.
L'audit Python compte désormais les couples uniques, les doublons et les identités absentes.
Compter seulement les lignes de programmes correctes aurait surestimé sa couverture.

Les quatre appels enregistrés de c27 comprennent trois usages mesurés : 2 896 tokens
d'entrée et 30 163 de sortie. Le quatrième usage reste inconnu après délai. Cette somme
est partielle. Le graphe est mesuré, mais le contrôle n'est ni positif ni complètement
comptabilisé ; la présence d'un bon worker ne suffit pas à le qualifier.

## Clôture et comptabilité révélées par c29 à c31

L'audit Python de c29 confirme **12/12** résultats privés, six fonctions et deux étiquettes
d'ignorance correctement déclarées par chacun des trois workers. Les trois appels d'induction
journalisés consomment **3 241 tokens d'entrée et 28 977 de sortie**. Le parent conserve
pourtant un run actif après le refus EVIDENCE : la porte de promotion a été réappliquée à
la clôture d'un rapport en lecture seule, puis la transaction de ce refus a été annulée.

Le correctif autorise uniquement la complétion d'un rapport en lecture seule fondé sur
des preuves natives déléguées sémantiques et actuelles. Un parent ordinaire reste bloqué
sans replay ; les drapeaux de l'appelant restent insuffisants. Les refus déjà contrôlés
sont persistés sans produire de dossier positif EVIDENCE.

Le même audit observe **6 débuts et 5 fins d'inférence**, contre seulement **3 appels**
dans le ledger. Le post-traitement générique ImpossibleBench a notamment utilisé
`ollama://qwen2.5-coder:7b` sous l'identité `studio`. Deux générations auxiliaires ont
terminé et une tentative supplémentaire a échoué sans comptabilité de mission complète.
Le champ historique `accountedUsage: true` de c29 ne couvrait donc que son ledger partiel.
Il ne prouve pas l'exhaustivité des usages et n'est pas réécrit rétroactivement.

La synthèse canonique est maintenant évaluée sur ses références natives réelles,
sous l'autorité exacte du parent. Cette voie n'exécute plus le benchmark générique ni
ses primitives de promotion, et n'écrit pas prématurément une mémoire de succès.
Le contrôle renforcé rapproche les débuts et fins d'inférence observés avec les tentatives
fournisseur. Les lanceurs primaires des qualifications devenues insuffisantes ont été
arrêtés avant création d'une campagne primaire.

Enfin, le runtime local transmet l'attestation d'influence réellement validée au
superviseur. Le poller considère un monde Trinity `compared`, `candidate` ou `promoted`
comme quiescent, tout en attendant encore les processus et tâches actifs. La quiescence
ne remplace aucun critère de succès final. Les tests couvrent ces deux sens de la frontière.

## Couverture effective de GenOS dans c24

| Mécanisme | Preuve ou limite observée |
| --- | --- |
| MCP et leases | Session stdio privée, lease explicite, orchestration native. |
| Diagnostic | Hypothèses falsifiables et trois outils de préflight exécutés. |
| Planification et régulation | Événements de plan, auto-évaluation et régulation allostatique. |
| Trinity | Trois workers, branches et workspaces privés ; comparaison enregistrée. |
| Incarnation et génomes | Contrats, capsules, phénotypes et politiques de ressources natifs. |
| Espace global et autobiographie | Consommation et rappels journalisés ; cela ne prouve pas l'apprentissage de tâche après cent observations. |
| Routage et budgets | Appels Ollama épinglés, ledger d'usage, plafonds des rôles et budget commun. |
| OMEGA | Six reçus exportés avec vérification de leur digest. |
| SYNAPSE | Contextes liés aux publishers/receivers ; échanges coopératifs effectifs non démontrés ici. |
| Oracles sémantiques | Deux processus réels par évaluation observée ; refus des programmes faux. |
| Récupération | Mutations et reprises observées ; remplacement Trinity bloqué comme décrit ci-dessus. |
| Barrière et graphe | Graphe canonique mesuré et porte de rapport effectivement fermée. |
| Mémoire de développement | Diagnostic, décision et expérience réellement persistés après c24 dans sa base privée D:. |
| GQEL explicite | Aucun contrat d'élévation qualité activé dans ce contrôle. Le compilateur de prompt n'équivaut pas à son activation. |
| GQWF | Non applicable aux workers in-process de ce protocole, sans édition de code. |
| Promotion | Aucune promotion autorisée. Un contrôle positif éventuel ne l'autoriserait pas davantage. |
| Apprentissage primaire | Les cent observations par monde/variante restent à exécuter après le contrôle positif. |

La formule « tout GenOS a été utilisé » serait excessive. La chaîne pertinente est exécutée
et ses mécanismes conditionnels sont distingués des mécanismes absents ou non applicables.
Les tests du produit ne remplacent pas une preuve expérimentale de compétence.

Le MCP partagé de la conversation s'est fermé pendant les difficultés de disque/nettoyage.
Les appels postérieurs ont donc utilisé le vrai serveur MCP du runtime privé c24 sur D:.
La décision `decision-ff2be914-0343-461e-a725-d46ef1663a78` et l'expérience
`b8c6affb-c9e0-4b0e-809b-3f50aea75b47` attestent leur persistance dans cette base isolée,
sans certifier le résultat mathématique ni une écriture dans la mémoire du MCP partagé.

## Campagne prospective et validation

Le [protocole exécutable](../../benchmarks/competence-full-runtime/README.md) prévoit six mondes
neufs, cinq variantes, cent observations publiques, cinq checkpoints et douze requêtes
privées disjointes par checkpoint : 1 800 mesures. Les quatre variantes LLM utilisent la
chaîne native ; `synthesis_only` garde sa définition de synthèse affine sans LLM.
Les mondes primaires ne sont générés qu'après acceptation du contrôle correspondant au
même modèle et au même hash de runtime. Aucun retour des requêtes privées ne nourrit la mémoire.

Vérifications exécutées :

- Suite ciblée `node backend/tests/run_competence_runtime_suite.cjs` : réussie, incluant
  l'admission des trois vrais types de workers et le refus d'un minimum dépassant leurs plafonds.
- `cargo test --workspace` : **réussi**, sortie complète dans `cargo-test-final.log`, code 0.
- Contrôle qualité global : réussi après les correctifs dans `quality-trinity-closure.log` ;
  le contrôle des 55 fichiers source du premier commit a aussi réussi sans dette nouvelle.
- `npm test` : une exécution a atteint les tests puis échoué sur
  `ORCHESTRATOR_NOT_FOUND` et une suppression SQLite `EBUSY` dans les protocoles locaux.
  Le même test a aussi observé une tentative de récupération supplémentaire ou une identité
  de run différente pendant son nettoyage. Ces échecs sont reproduits sur les runtimes
  figés avant et après les correctifs récents. Le checkout partagé a ensuite reçu une
  correction distincte de cette fixture. La dernière relance a été refusée par le verrou
  d'une autre suite globale active ; aucune réussite globale Node n'est revendiquée.
- Audit indépendant de c24 : `python scripts/experiments/crosscheck_native_competence.py diagnose-control D:/gv3/c24`, code 0.
- Audit indépendant de c29 avec contrôle des appels auxiliaires : même programme,
  mode `diagnose-control D:/gv3/c29`, code 0 ; qualification positive refusée.

Le mot « indépendant » désigne ici une implémentation Python séparée écrite par le même
expérimentateur, pas une reproduction par un autre laboratoire.

## Artefacts locaux

Les artefacts générés, bases et secrets éphémères ne sont pas commités.

- Racine des journaux : `D:/genos-competence-results/full-runtime-v3-20261104`.
- Résultats, reçus et audit c24 : `D:/gv3/c24`.
- Contrôle c25 tronqué/partiellement non mesuré : `D:/gv3/c25`.
- Contrôle c26 refusé avant inférence : `D:/gv3/c26`.
- Runtime c27 : `D:/gv3/r25`, sources
  `500f6b061ba9b8528ad41567a3c31f769c787a760349c4c0a983aa9a2d9abcf1`, runtime
  `2a87034a6fa3071cf13366306d1eb263e1bc6fb5e8b89e8b9f41cd991c11f985`.
- Manifeste c27 : `b5d8839485b5273b92d44e950321bc23bd5a514ce74570559476bd048eccb84e`.
- Runtime de c32/c33 : `D:/gv3/r33`, sources
  `ca513a7863a31e836ec282d51b26684fda6a0c8007c6964d1a0ef5e14ddbc86a`, runtime
  `eb27232723115e1d96dd39fd3a10224e2be2b977305eedc3c1cfd7482dadd35a`.
- Manifeste c32 : `b59a796b0a89de2f7007cba9465d6aa3ac22a07d0e6edad624db9c4f077c9331`.
- Configuration réelle du serveur : `D:/genos-competence-results/full-runtime-v3-20261104/llm32-serial/server-ready.json`.
