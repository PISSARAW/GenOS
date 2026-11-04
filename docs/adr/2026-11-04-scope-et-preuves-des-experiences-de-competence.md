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
