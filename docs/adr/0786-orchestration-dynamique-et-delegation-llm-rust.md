# Orchestration dynamique et délégation LLM dans Rust

**Statut** : Accepté pour un pool borné de workers préadmis  
**Date** : 2026-11-03  
**Domaine** : Runtime Rust, délégation native, ordonnanceur, budgets et preuves  
**Lié à** : [Vagues LLM parallèles](0785-missions-llm-paralleles-et-outils-rust.md)

## Contexte

Le profil parallèle exécute un DAG configuré avant la mission. Il ne permet
pas à un coordinateur LLM de choisir des tâches pendant son dialogue,
d'activer seulement les workers utiles et d'adapter une délégation ultérieure
aux résultats reçus. Ajouter cette capacité demande de conserver la distinction
entre une demande du modèle, un effet effectivement admis et son résultat.

## Décision

Ajouter une option explicite `orchestration` au profil agentique existant.
Elle désigne un coordinateur, dernier agent de la configuration, et un plafond
de délégations. Les autres agents forment un pool de un à trois workers
préadmis, initialement dormants. Chaque worker reçoit au plus une affectation
dans la mission. La largeur parallèle reste bornée par `max_parallel_agents`.

Le seul outil supplémentaire est `delegate_task`, réservé au coordinateur.
Ses arguments choisissent un worker du pool et un texte de tâche borné.
Ils ne peuvent créer une identité, modifier les instructions d'autorité,
changer le fournisseur ou élargir les permissions. Les instructions déléguées
restent des données, sous l'instruction et les outils admis du destinataire.

Le runtime tire une affectation du véritable appel structuré observé dans
une réponse native. Sa transaction conserve l'affectation, l'activation MORPH,
la copie CAS de la tâche et le reçu d'enregistrement de l'outil. Un échec
annule tous ces effets et leur coût. Le reçu d'enregistrement n'est pas
remplacé ultérieurement par une prétendue exécution du worker.

Après la clôture du tour de délégation, le coordinateur attend les workers
qu'il a activés. Le runtime exécute leurs tours prêts dans les vagues
parallèles existantes. Il copie et rehashe leurs complétions et artefacts
vers le coordinateur, puis permet son tour suivant. Le coordinateur peut
alors déléguer à d'autres slots encore dormants ou terminer son résultat.

Le graphe porte sur les tours : `C0 → W1/W2 → C1 → W3 → C2`.
Les `depends_on` statiques sont vides dans ce profil. Transformer ces arcs
en dépendances entre rôles créerait artificiellement un cycle.

## Frontières des sept protocoles

- **MORPH** installe les identités et permissions avant tout HTTP, puis lie
  chaque activation à une affectation authentique et unique.
- **OMEGA** conserve le dispatch unique des modèles, l'enregistrement atomique
  et idempotent des délégations, et les événements originaux des effets.
- **ALLOSTASIE** garde les réservations globales, le règlement réel et la
  réserve protégée. Une délégation ne recharge aucun quota.
- **SYNAPSE** lie le worker à sa tâche reçue et le coordinateur aux résultats
  effectivement reçus avant son tour. Les anciens contextes restent stables.
- **GQWF Exchange** copie les tâches sans inventer une complétion du parent,
  puis copie les véritables résultats des workers avant consommation.
- **CONTINUITY** conserve les affectations et refuse une succession tant
  qu'une délégation ou un retour requis reste en attente.
- **EVIDENCE** exige la couverture exacte des délégations admises, de leurs
  appels natifs, activations, copies et résultats avant publication finale.

Pour un contexte de coordinateur au tour `t`, seules les affectations émises
aux tours strictement antérieurs sont visibles. Leur tâche, origine et retour
sont immuables. Cette frontière empêche une nouvelle délégation d'altérer le
contexte qui l'a demandée. Un contexte de worker dépend de son unique tâche.

## Points de livraison

1. Contrat explicite d'orchestration et admission du pool dormant.
2. Journal d'affectations natives, unicité et activation MORPH.
3. Outil de délégation, permissions et effet atomique.
4. Copies CAS des tâches et retours GQWF authentiques.
5. Contextes SYNAPSE historiques de délégation et résultats.
6. Ordonnancement dynamique, attente du parent et vagues de workers.
7. Fermeture EVIDENCE, publication et garde CONTINUITY.
8. Qualification runtime HTTP : choix, adaptation, concurrence et reprise.
9. Qualification CLI et essai avec un modèle local réel.
10. Contrôles globaux, documentation et audit de livraison.

Chaque point reçoit son commit. Les modules sont activés suivant leurs
dépendances et les validations finales portent sur l'ensemble intégré.

## Limites

Le pool est borné et préadmis : aucune création arbitraire d'agent, délégation
récursive de worker ou réutilisation d'un slot déjà affecté. Les tâches
évoluent pendant la mission ; les permissions restent celles de l'admission.
L'ordonnanceur garde la barrière entre vagues. Les workers partagent l'hôte
et le fournisseur, qui peut sérialiser le calcul des générations.

Une observation inconnue ne recrée pas son permis au rejeu. Les observations
et effets réellement persistés sont réconciliés sous les gardes existantes.
La publication prouve le contrat d'artefact et sa fermeture causale. Elle
n'établit aucune vérité sémantique ni autorité de promotion ou d'effet externe.
