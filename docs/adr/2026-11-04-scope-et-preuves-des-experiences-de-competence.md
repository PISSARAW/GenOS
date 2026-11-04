# Scope et preuves des expériences de compétence

Date : 4 novembre 2026. Statut : accepté pour l'implémentation ; qualification expérimentale distincte.

## Problème

L'audit de compétence utilisait un workspace sur D: et un appelant MCP lié au dépôt sur C:.
Le bootstrap pouvait réaffecter le chemin de `ws-local`, alors que cette identité était déjà utilisée.
Trois workers supervisés échouaient ensuite sur une variable `controlIdentity` non extraite du lancement.
Enfin, la barrière pouvait demander le graphe de l'alias comparatif Trinity plutôt que celui de la mission scellée.
Un graphe absent reste un motif de refus : corriger son sélecteur ne justifie pas de fabriquer des preuves.

## Décision

- Conserver le workspace local existant. Enregistrer un autre chemin avec une identité stable distincte.
  Refuser les changements d'organisation ou de projet d'un chemin déjà attribué.
  L'adoption d'une ancienne ligne entièrement dépourvue de tenant reste limitée au même chemin.
  Stocker le chemin canonique Windows attendu par la recherche exacte de l'appelant MCP.
- Provisionner l'appelant de chaque expérience dans son vrai workspace et sa base privée.
  Les permissions de lecture inter-workspaces ne sont pas élargies.
- Transmettre `controlIdentity` déjà préparée au superviseur.
- Préférer l'identifiant de mission normalisé et scellé à l'alias de comparaison.
  Conserver les vérifications de membership, de liaison run/mission et de reçus natifs.
  Les workers portent aussi cette mission canonique ; leur identifiant d'expérience Trinity reste distinct.
- Accepter l'alias public MCP `worker_assignments` au préflight Trinity comme `workerAssignments`.
  Les affectations utilisent les rôles réellement composés, pas les noms des mondes comparatifs.
- Exécuter les missions locales multiworkers avec la chaîne agentique commune.
  La voie locale spéciale reste réservée aux missions au plus monoworker.
  Un modèle local explicite ne doit pas faire traiter prématurément un orchestrateur comme un worker.
  Une topologie ou un effectif multiple explicitement demandés interdisent également le raccourci,
  même si le plan préliminaire n'a pas encore alloué de workers.
- Transmettre le modèle, son contexte, les limites d'inférence et la désactivation explicite du rappel.
  Les ablations de mémoire doivent atteindre les workers et ne pas être seulement annoncées dans le prompt.
- Les champs d'évidence demandés par une méthode scellée deviennent obligatoires dans le schéma guidé.
  Pour l'induction bornée, exiger directement l'objet `functionPrograms` : une chaîne JSON imbriquée
  ou un schéma conditionnel ignoré par le fournisseur ne garantissent pas une proposition exploitable.
- Enregistrer le prompt exact de l'induction bornée avant son invocation. Un contrat scellé
  contenant des exemples ne prouve pas, à lui seul, leur présence dans le message envoyé au LLM.
  Compiler une entrée compacte depuis ce contrat pour cette primitive numérique : identité opérationnelle,
  rôle, exemples, programmes publics et exigences d'artefact. Les biographies et modèles génériques de rédaction
  ne font pas partie de ce calcul. Les réparations qualité et obligations d'équipe explicites restent ajoutées.
  La planification, l'incarnation, les budgets, les protocoles et les portes de preuve restent actifs.
- Exécuter le diagnostic MCP demandé avant la mission même si le portefeuille initial n'avait pas
  de phase diagnostique. Conserver ses hypothèses pour l'évaluation après exécution.
- Ajouter l'oracle sémantique `bounded_function_induction` sur l'infrastructure d'observation existante.
  Deux processus isolés contrôlent les exemples publics et l'identifiabilité dans les trois familles bornées.
  Leur sujet relie contrat scellé, sortie brute, identité du run et usages réels du LLM.
  L'oracle d'artefact seul reste insuffisant pour une réception biologique sémantique.
- Déclarer explicitement le profil de cette recherche locale en lecture seule : risque faible,
  réversibilité élevée, tests déterministes. Le mot « production » dans une description de calcul
  ne doit pas transformer cette expérience en incident nécessitant une approbation humaine.
  Aucune approbation ni décision positive n'est fabriquée.

## Validation et portée

Le contrôle réel c27 a révélé deux incohérences supplémentaires. La création par fleet omettait
la durée explicite de la mission lors du scellement du contrat du worker : la durée par défaut
de neuf minutes restait appliquée malgré une enveloppe parent plus longue. La durée validée
par `workerResourcePolicy.timeAllocation` est maintenant transmise au contrat persisté.
Les plafonds de tokens et la limite maximale de durée restent appliqués.

Le reçu biologique réappliquait ensuite la porte de promotion à une complétion de worker
déjà acceptée. Le prédicat de complétion du runtime distingue pourtant explicitement ces étapes.
Le reçu certifie désormais la complétion si le run est terminé sans blocage et porte une vraie
preuve sémantique native. `promotionReason` conserve le refus de promotion ; les fonctions
de promotion et leurs exigences de replay ou d'approbation ne sont pas modifiées.
Les anciens reçus scellés restent immuables : un contrôle frais doit qualifier cette correction.
Un test exécute deux processus d'oracle réels, vérifie la complétion, puis confirme que la
promotion sans replay et les déclarations sans attestation restent refusées.

Le format sélectionné `operator-keyed/v1` exige une propriété par couple opérateur/époque.
Le schéma lie la clé aux valeurs constantes d'identité et refuse les propriétés supplémentaires.
Il empêche les doublons qui occupaient une place tout en omettant un opérateur demandé dans c27.
Les coefficients restent proposés par le LLM et vérifiés par l'oracle ; aucune réponse n'est calculée
par ce changement de format. Les contrats historiques sans cet encodage conservent leurs tableaux.

La récupération Trinity avec une nouvelle identité ne réutilise plus la capsule privée de l'ancien worker.
Elle vérifie d'abord sa délégation scellée, copie le snapshot de l'expérience, puis transfère l'identité
active du même monde et lie le nouveau workspace privé dans une transaction. Le hash, le parent et le
tenant sont contrôlés par la procédure native existante. Un échec annule le transfert du monde.
L'ancienne identité et sa capsule restent disponibles comme provenance ; la lignée conserve le worker
source. Le nombre de mondes et leur stratégie ne changent pas. Une récupération avec la même identité
conserve sa capsule. Le test couvre le nouveau scope de démarrage, le refus d'un parent étranger,
le rejet d'un snapshot altéré et le rollback du transfert.

Dans c29, les trois workers sont vérifiés, mais la clôture du parent en lecture seule réapplique
la promotion puis EVIDENCE refuse son état bloqué ; la transaction rétablit un run fantôme `running`.
Un parent dont le contrat scellé sélectionne `factual_read_only` ou `formal_read_only` peut désormais
terminer sur une preuve déléguée native sémantique effectivement validée. Les preuves de transport
seules et les drapeaux de l'appelant ne suffisent pas. Les obligations de résultat de mission restent
évaluées. La promotion conserve ses portes et le parent ordinaire reste bloqué sans replay.
Lorsqu'une complétion déjà contrôlée aboutit à un run bloqué, le protocole conserve ce refus et
n'émet aucun dossier positif EVIDENCE ; il ne rétablit plus artificiellement le run actif.
Le test exécute deux vérificateurs réels, vérifie le dossier du parent en lecture seule, le refus
persisté du parent ordinaire et le rejet d'un succès sans attestation.

Le post-traitement local lançait aussi ImpossibleBench avec `agentId: studio`, un modèle
automatique et sans base transmise au routeur. Deux appels Qwen 7B ne figuraient donc pas
dans le ledger du contrôle c29. Pour une synthèse canonique en lecture seule, l'évaluation
porte maintenant sur ses vraies références natives déléguées, sous l'autorité du run courant.
Elle n'invoque pas ce benchmark générique, ni les primitives de promotion de branche,
et n'écrit pas prématurément une mémoire de succès de mission. Les rapports non canoniques
conservent leur voie historique ; cette correction ne qualifie pas toutes leurs évaluations.
Le contrôle et la campagne comparent en plus les débuts et fins d'inférence observés
à leurs tentatives fournisseur enregistrées. Tout écart interdit la qualification positive.

L'évaluation native canonique transmet aussi la liste effectivement validée des workers via
`DOSSIER_INFLUENCE_VERIFIED`, comme le fait déjà l'autre runtime supervisé. Sans cet événement,
le superviseur retenait un statut non vérifié malgré un run parent et un dossier EVIDENCE acceptés.
Le poller distingue enfin les états d'agents des états de mondes Trinity : `compared`, `candidate`
et `promoted` sont des états quiescents d'un monde. Les processus ou tâches encore actifs continuent
à bloquer l'attente. Cette correction permet d'évaluer le résultat final ; elle ne rend pas
un résultat refusé, une couverture insuffisante ou une porte d'homéostasie fermée acceptables.

Les tests ciblés couvrent deux racines concurrentes, le refus d'un tenant étranger,
une vraie liaison GVX run/mission face à un alias étranger et le maintien de la barrière pour un orchestrateur local.
Le contrôle d'induction doit ensuite dériver des programmes à partir d'observations publiques,
réussir des requêtes privées inédites et déclarer les cas manquants ou ambigus avant tout garde déterministe.
Un contrôle d'application auquel les règles sont fournies ne remplace pas ce contrôle.
Les familles et formules de différences finies sont publiques ; les coefficients et requêtes privées ne le sont pas.
Les nouveaux oracles ne certifient ni ces requêtes réservées, ni des fonctions hors classe, ni la compétence générale.

Le protocole `benchmarks/competence-full-runtime/` exige ce contrôle avant la campagne.
Les quatre variantes LLM passent par l'orchestration native ; `synthesis_only` conserve sa définition
de synthèse affine déterministe sans appel LLM. Les mécanismes conditionnels non exercés doivent être listés.
La formule « tout GenOS » ne constitue pas un critère mesurable tant que ses obligations ne sont pas explicitées.

## Alternatives écartées

L'environnement expérimental fixe aussi `GENOS_ORCHESTRATOR_BRIDGE` vers le runtime figé :
une valeur héritée peut sinon exécuter un checkout différent malgré `GENOS_REPO_ROOT`.
Les essais antérieurs concernés ne prouvent pas l'intégrité du runtime annoncé.
Le modèle, le contexte, le plafond de sortie et le réglage de raisonnement sont fixés avant le contrôle.
Un réglage explicite `reasoningEffort` fait partie du hash des limites d'inférence ; le modifier
après admission invalide l'autorité. Son absence préserve le comportement antérieur.
Les exports conservent toutes les tentatives de récupération ; l'acceptation porte sur la dernière
tentative de chacune des trois identités de worker, sans effacer les erreurs précédentes.

Rendre les graphes vides acceptables, lire les preuves d'un autre workspace,
changer le tenant d'une identité existante, qualifier un transport réussi comme une décision correcte,
ou remplacer la chaîne GenOS par un `fetch` direct vers Ollama ne résout pas les défauts de provenance.

## Références

- [Autopsie précédente](../06-qualite-preuves/autopsie-competence-et-couverture-genos-2026-11-04.md).
- [Protocole exécutable](../../benchmarks/competence-full-runtime/protocol.json).
