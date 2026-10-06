# Causes communes, composants et corrections — audit Trinity

48 missions originales, 88 tentatives, 324 mondes créés et 71 PASS locaux historiques. Les cinq refus Heterogeneous ne créent aucun monde. Les inventaires de 19 bases couvrent aussi des pilotes : leurs 342 lignes de mondes ne sont pas la cohorte. **Aucun monde de la cohorte n’a été promu.** La publication GitHub d’un livrable n’est pas une promotion Trinity.

Les rapports spécialisés analysent chaque mission, chaque tentative et chaque worker. Les pensées privées des modèles sont inaccessibles ; l’analyse décrit commandes, sorties, messages, hypothèses déclarées et réponses. Une trace absente reste inconnue. Les corrections ci-dessous sont proposées, pas déjà implémentées ni testées.

## Ce qui invalide une interprétation générale des anciens PASS

- Pareto très complexe, tentative6, monde1 : le front est correct, mais « batch domine ancien » est faux car sa latence3600 dépasse20. Le vérificateur accepte le front sans valider toutes les justifications.
- Exploratory moyen, a3, monde1 : une réponse utilise onglets/arbre/recherche malgré l’interdiction originale de menus/barres/recherche. Le graphe passe son test ; la mission originale échoue. Le second PASS a6-codex/m1 est distinct et relu séparément.
- Oracular très complexe :60 appels de méthodes dans un processus Node ne sont pas60 processus indépendants. Une calibration locale ne prouve pas une prédiction scellée avant observation.
- Des contrats livrent déjà les résultats attendus et certains tests contrôlent seulement longueur, nombre de rubriques ou propriétés autodéclarées. Les conseils architecturaux, l’ergonomie et les propriétés physiques nécessitent une validation supplémentaire.
- Des réponses apparues après la clôture historique sont recensées séparément. Elles ne sont pas ajoutées aux71PASS.

## Le premier point de rupture et ses cascades

1. **Admission du design.** Heterogeneous : diversité0,135 sous seuil0,35. Aucun worker lancé, donc aucune réponse ni pensée worker à évaluer. Construire une diversité réelle avant dispatch ; ne pas abaisser le seuil pour obtenir un succès.
2. **Liaison mission–worker.** BIOLOGICAL_WORKER_MISSION_AMBIGUOUS apparaît avant l’exécution utile dans plusieurs essais. biologicalWorkerStore.missionForWorker filtre mission active, assignation et missionId. Le même code est levé pour zéro et plusieurs correspondances : le message seul ne prouve pas une double assignation. Journaliser requestedMissionId, candidateIds/status et motif none/multiple. Dans les dossiers où la valeur d’appel n’est pas enregistrée, l’erreur de missionId reste une hypothèse.
3. **Entrée dans l’exécuteur.** Rôle non résolu, outil natif manquant ou capsule absente : le runtime ne peut pas exécuter la stratégie. Un programme ou rôle demandé ne constitue pas une action exécutée.
4. **Exécution.** Arrêt par budget ou santé : un fichier answer peut avoir été écrit avant l’arrêt. Sa présence ne rend pas le run réussi.
5. **Clôture.** PID, statut agent, rapport, métriques et reçu peuvent diverger. BIOLOGICAL_WORKER_RECEIPT_SEALED indique un traitement d’événement après scellement ; ce n’est pas automatiquement la cause primaire. Clôturer après quiescence, de façon idempotente, et conserver le premier arrêt.
6. **Barrière initiale.** trinityComparisonRuntime.completeInitialWorlds exige trois rapports initiaux, ou seize pour Factorial, tous outcome=success sans failure. Une réponse locale PASS avec run bloqué ne suffit pas. Cette barrière coupe la comparaison avant jury, récursion, adaptation, QD et promotion.
7. **Mécanisme et preuve.** Claims, receveurs, child missions, votes ou réplications doivent être effectivement vérifiés. Un worker qui décrit le mécanisme ne l’a pas nécessairement exécuté.
8. **Promotion.** Il faut candidat distinct en quarantaine, hash conforme, vérification d’intégration, reçu indépendant et intégration autorisée. Aucun cas n’a traversé ce parcours.

Les listes d’états terminaux diffèrent entre moniteur, cross-examination et continuations. Le cross-examination accepte completed/error/failed/terminated/cancelled, mais pas blocked ; d’autres chemins incluent apoptosis/unverified/quarantined. Harmoniser états et quiescence. Ce risque ultérieur n’est pas attribué comme premier échec aux tentatives déjà arrêtées avant comparaison.

## Comptabilité et budget

Dans le runtime capturé, agent-runtime-session.cjs:229 estime le prompt en octets UTF-8 divisés par4 ; aux lignes389–391, un prompt trop gros peut arrêter le child au démarrage. agent-runtime-events.cjs:38 compte total_tokens ou input_tokens+output_tokens. Aux lignes71–76, il conserve le **maximum** des valeurs rapportées ; sans usage exact, il ajoute une estimation des messages. Le garde applique exactTokens||estimatedTokens au plafond.

Le compteur comprend donc éventuellement le contexte d’entrée : ce n’est pas «8000nouveaux tokens de réponse». Si un adaptateur fournit des compteurs par tour, leur maximum ne donne pas une consommation cumulée ; si ses compteurs sont cumulatifs, il peut être correct. Il faut établir la sémantique de chaque adaptateur. Estimation, contexte mis en cache, usage fournisseur et facture sont distincts.

Les guards annoncent des dizaines à centaines de milliers de tokens alors que des métriques de stratégie restent0 et des receipts disent tokens/provider_billing indisponibles. **Zéro ne signifie pas coût nul.** Aucun coût fournisseur réel ne doit être inventé.

CorrectionP0 : ledger entrée/sortie/cache, cumulatif ou par-tour, source/confiance et coût inconnu explicite ; budget appliqué à la dimension définie ; précontrôle avant spawn ; clôture unique après vidage des événements. Critères : petit/gros prompt, deux tours indépendants, compteur cumulatif et arrêt concurrent ont les comptes attendus, un reçu unique et des statuts concordants. Conserver les gardes si le budget réel est dépassé.

## Types de workers, relations et discussion

Le rôle scientifique, le WorkerKind, la recette/capacité et le provider/modèle effectivement appelé sont quatre informations distinctes. Trois prompts ou noms différents ne prouvent pas trois méthodes indépendantes ; trois modèles différents ne prouvent pas davantage une diversité de raisonnements.

Un bounded_worker peut proposer une preuve ; il ne doit pas auto-valider sa vérité. Les calculs déterministes demandent un oracle/exécuteur indépendant quand possible ; un test fini ne démontre pas une proposition universelle. Un creative_worker peut explorer une interface, puis une évaluation indépendante doit vérifier contraintes et scénarios. **Jury difficile assigne des creative_worker/literary_author à une architecture de messagerie** : le routage est établi, l’inadéquation est une appréciation argumentée à tester, pas une connaissance des capacités internes.

Les83messages d’organisation des inventaires ne sont pas83discussions entre solveurs. Les handoffs parent portent surtout les échecs de comparaison, en canal orchestrator_handoff, modalité plasmid, destinataire nul/vides. Delivered atteste une persistance d’enveloppe, pas une objection reçue et traitée.

Préserver l’isolement initial, puis autoriser une contradiction sur dossiers scellés : objection liée à une claim, reviewer indépendant, réponse référencée et arbitrage traçable. Une conversation libre avant les preuves pourrait corréler les erreurs. Les tableaux individuels documentent les relations observées et les lacunes.

## SHEV

18tables par base,342tables inventoriées, zéro ligne. Aucun mandat/observation/initiative persisté ; cela ne démontre pas une panne intrinsèque de SHEV.

Définir explicitement s’il est requis. Sinon, son absence n’est pas un défaut de la mission. S’il l’est : mandat autorisé, observation corrélée, initiative bornée et retour vérifié au backlog, sans contourner les gates. Acceptation : initiative pertinente traceable, initiative hors mandat refusée, contrôle sans SHEV.

## AGOW

GLOBAL_WORKSPACE_CONSUMPTION montre admission et consommation par planning/execution/reporting. Le fallback de missionPlanning.js:148–180 suffit à produire cet événement. L’audit vérifie aussi adaptive_state, car AGOW persiste dans des stores génériques : les scopes observés ne contiennent pas le cycle AGOW complet/arbitrage/broadcast/reçus d’expérience.

Tracer mode demandé/effectif, candidats, validation, arbitrage, frame, broadcast, receivers, reçus et changement d’action. Comparer broadcast livré/supprimé avec mêmes entrées/seed. Critère : effet sur une action valide, pas seule émission de télémétrie.

## G-CIR Omega

28sessions et28événements de visibilité dans l’inventaire complet. Ce ledger ne prouve pas le graphe READ/SELECT/CALL/INFER/CHECK/EMIT exécuté et vérifié. Des tentatives natives échouent avec tool_missing ; le nom d’une recette n’est pas son exécution.

Conserver programme/version, étapes entrées, arguments hachés, outil/sortie, CHECK autorisé et receipt avant EMIT. Tests : graphe complet valide ; CALL bloque outil absent ; CHECK bloque résultat falsifié ; aucun EMIT sans preuve. Comparer à une baseline procédurale.

## AEIS et validité des mondes

Les tables épistémiques/AEIS inventoriées sont vides et aucun reçu indépendant de claim n’est identifié dans la cohorte. Les receipts biologiques attestent une liaison/exécution et son intégrité, pas la vérité de chaque affirmation. Un hash certifie l’identité d’un fichier, pas sa correction.

Certains answer.json omettent claims/evidence/provenance/budgetStatus. Des rapports candidats ajoutent parfois ces champs : vérifier le rapport **effectivement accepté**, et le type des valeurs. Un objet budgetStatus ne satisfait pas un chemin exigeant la chaîne within. Ce risque de gate ultérieure ne remplace pas un blocage antérieur observé. Les deux red_workers Temporal/Oracular très complexes monde3 manquent leur verification_report typé ; d’autres absences de champs n’impliquent pas absence de tout critère textuel.

P0 : valider schéma, claimIDs, liens evidence/artefact, identité indépendante, commande, hash et signature. Puis sémantique de domaine : logique, dominance, invariant ou statistique. Critère : claim sans preuve, résultat faux, reçu auto-signé et fichier altéré refusés ; dossier correct vérifié sur copie isolée. Ne jamais fabriquer rétroactivement des receipts manquants.

## NSE

714lignes search_module_state dans les19bases. Décisions et action receipts FORAGE, PLASTICITE, CLONAL_AFFINITY_SEARCH sont observés. Exemple FORAGE : PATCH_DEPARTURE avec infoGain0 et rendement marginal insuffisant. Le succès d’actuation ne signifie pas réussite de mission ni gain causal.

Relier état avant/après, hypothèses falsifiées, mutation effective et résultat. Comparer actif/inactif à modèle/budget/fixture identiques. Distinguer activité, stagnation et progrès utile. Transmission de culture uniquement avec provenance et respect des frontières.

## NCE : chemins Play, phénotype, culture et POET

Ces quatre chemins correspondent à la précision donnée par l’utilisateur pour «Valider play». Les tables nce_play_observations/culture_transmissions/culture_phylogeny sont vides. Des PHENOTYPE_CHANGED et modifications de search-genome locales sont observées ; elles ne certifient pas un développement créatif complet. Certains services travaillent en mémoire : absence de table renseignée ne prouve pas qu’aucun code n’a été appelé. Les configurations culture/phenotype=true et play=false ne prouvent pas l’activation.

**Play** : session bornée, snapshot, commande autorisée en sandbox, résultat, observation et découverte vérifiée ensuite utilisée. Contrôles : sans sandbox, taille snapshot, timeout. Une narration de jeu ne suffit pas.

**Phénotype** : vecteur initial, stimulus, transformation, vecteur final/version et effet sur actions/capacités. Un changement de rôle ou prompt ne prouve pas une acquisition. Vérifier invariants et contrôle sans transformation.

**Culture** : découverte validée, donneur/receveur, scope, transmission et réutilisation mesurée. Contrôles faux savoir et sans transmission. Une copie entre mondes peut contaminer l’expérience ; route culturelle conforme à l’indépendance.

**POET** : environnements avec seed/difficulté, condition de complexité admissible, agent associé et transfert effectivement testé vers un environnement cible. Comparer performance avant/après et coût. Des scores sans environnement ni transfert ne qualifient pas POET.

## GVX

57tables GVX inventoriées, zéro ligne. Aucun graphe de compétence, parcours développemental ou receipt GVX attesté. Adaptive_worker et binding biologique ne prouvent pas GVX. Il n’est pas nécessairement requis pour une mission mathématique.

Tracer profil/autorité, curriculum/compétences, état somatique, action, receipt et replay. Critère : capacité réellement acquise ou action refusée par le profil, avec ablation de la voie développementale.

## Prototypes QD

L’archive peut être en mémoire : table absente n’est pas preuve d’inaction. candidateFromReport exige vecteur numérique, behaviorVectorEvidence et IDs de receipts vérifiés. Le chemin QD est exécuté avant le cross-examination local de ce cycle : si les receipts ne sont pas disponibles avant, il rend verified_behavior_vectors_missing. Ce risque d’ordre n’a pas été exercé par les tentatives arrêtées avant comparaison.

Mesurer et vérifier les descripteurs avant sélection, persister niches/qualité/novelty et réplications. Préparer les receipts en préphase ou déplacer la vérification nécessaire. Critère : plusieurs niches vérifiées, réplication réellement exécutée vers niche sous-représentée, effet recalculé ; vecteur sans reçu refusé.

## Signal planes

133tables signal/ligand, zéro ligne. Les enveloppes plasmid d’organisation binaires existent séparément ; encodage/persistance ne prouvent pas publishSignal→receptor→action effectuée.

Tracer signal typé, scope, émetteur/destinataire, récepteur, coalescence, livraison et effet. Tester duplicats, TTL, route interdite, récepteur absent. Critère : une seule action autorisée sur doublon, aucune sur invalide, effet indépendant vérifié. Fallback LLM explicite et soumis aux gates.

## Ce qu’il faut améliorer par variant

- **Controlled** : budget/clôture/report cohérents puis comparaison de trois trajectoires réellement indépendantes ; contrôler justifications, pas seulement réponses finales.
- **Heterogeneous** : diversité mesurée avant dispatch et méthodes réelles distinctes ; cinq refus sont des essais, pas des missions résolues.
- **Factorial** : rôles résolus, seize cellules présentes, modèles/providers réellement exécutés et provenance de traitements ; effets/interactions calculés sur résultats vérifiés.
- **Pareto** : dominance composante par composante et explication correcte pour chaque élimination ; préférences et incertitudes explicites ; ensemble Pareto distinct d’un gagnant promu.
- **Adversarial** : défenseur/falsificateur/arbitre avec objection précise, indépendante et réponse observée ; ne pas confondre autocritique locale et débat.
- **Counterfactual** : intervention déclarée sur un facteur, conditions communes, replay/état final et décision causale vérifiés ; simple branche isolée insuffisante.
- **Temporal** : événements/ordre/horizon/état vérifiés ; analyse de stabilité indépendante et contradictions entre horizons explicites.
- **Oracular** : prédiction scellée avant événements, outcomes alignés et calibration reproduite ; oracle consultatif, sans autorité de promotion.
- **Jury** : admission factuelle avant notation, dossiers aveugles, deux évaluateurs/votes traçables, abstention et coûts ; solveurs littéraires ne remplacent pas jury d’architecture.
- **Recursive** : sous-problème utile, childMissionId/parent/snapshot, budget/profondeur/cycle et reprise après résultat vérifié ; recursion d’une fonction locale n’est pas sous-Trinity.
- **Adaptive** : obligations et incertitude vérifiées avant réallocation, budgets requested/granted/consumed, continuation réelle, comparaison uniforme sur mêmes instances/seeds.
- **Exploratory** : mission intégrale et interdictions contrôlées ; descripteurs/niches mesurés, réplications QD ; propriétés collectives et physiques testées dans campagnes dédiées ou annoncées conceptuelles.

Ordre : **P0** identité, contrat, budget, clôture, preuve ; **P1** mécanisme de chaque variant ; **P2** comparaisons causales et ablations. La campagne actuelle ne classe pas la supériorité des variants : missions/exécuteurs/corrections/retries ne sont pas constants.

Voir ameliorations-par-variant.md et les trois rapports pour les critères détaillés et les références par mission.

## Provenance et limites

Le DOCX source SHA-256 est a68540e55f4e0435a221b4585225c5bbece8ff6b9902994911d72878cd766d44. Les dossiers spécialisés fournissent file/pointer/ligne/SHA et confiance ; la coverage vérifie48/88/324 et identités uniques.

Les bases sont lues sans mutation. Le probe parent utilise mode=ro/query_only/BEGIN ; des agents ont lu des exports persistés ou une base immutable uniquement avec WAL observé vide, avec limite non atomique explicitée. Les colonnes binaires du probe sont représentées par leur taille : ce n’est pas une preuve de leur contenu.

Le runtime D et le checkout ont changé pendant la campagne. Un hash actuel ne vaut pas hash au dispatch. Les agents distinguent hashes capturés et code consulté pour interprétation. Dates SQL et ISO sont conservées dans leur format ; ne pas inventer la timezone d’une date non qualifiée.

Cette livraison sur D contient échecs et recommandations. Aucune publication externe de cet audit n’a été faite : l’autorisation précédente portait sur les réussites et leurs vérificateurs.
