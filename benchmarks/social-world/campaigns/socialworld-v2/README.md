# SocialWorld V2 — Boucle causale et autonomie sociale

## Statut

Protocole conçu, non exécuté. Ce dossier ne contient aucun résultat de campagne. Les
résultats V1 restent la référence pour la validation des mécanismes sociaux élémentaires.
V2 vise à établir qu'une interaction modifie durablement l'état social et que cette
modification change une décision future non annoncée aux agents.

## Question expérimentale

Dans quelles conditions GenOS permet-il à des agents d'initier, conduire, mémoriser et
réutiliser des interactions sociales, et quel effet causal les relations et la physiologie
sociale ont-elles par rapport à des systèmes témoins ?

## Règles de preuve

- Les décisions et mutations observées dans GenOS, les reçus vérifiés et la base persistée
  constituent les oracles principaux. La réponse du LLM n'est jamais à elle seule une
  preuve de réussite.
- Chaque run enregistre le commit, la configuration, la graine, la version de schéma, les
  événements d'entrée, les reçus, les états avant/après et les traces du modèle. Les secrets
  et chaînes de pensée ne sont pas enregistrés.
- Le scénario et son événement déclencheur ne sont pas communiqués individuellement aux
  agents. L'orchestrateur publie seulement l'état environnemental prévu par le protocole.
- Les seuils, graines et règles d'exclusion sont figés avant les runs. Un run interrompu,
  une erreur de modèle ou une donnée manquante est `inconclusive`, jamais `pass`.
- Répéter avec les mêmes graine et configuration doit reproduire les événements et états
  déterministes. Les sorties de modèle peuvent varier et sont rapportées séparément.

## Expériences

### V2-01 — Dialogue autonome entre amis

Deux agents ayant un événement partagé échangent au moins quatre tours alternés. Le premier
contact est déclenché par un événement du monde après l'initialisation. Les agents peuvent
répondre ou garder le silence selon les règles de consentement et de capacité.

**Oracle de succès :** au moins quatre messages livrés avec reçus valides, deux références
aux éléments reçus dans les tours suivants, et une mutation vérifiable de mémoire chez les
deux agents. Une relation peut évoluer uniquement si les événements et la politique le
justifient. Aucun message non autorisé, aucune référence inventée et aucune répétition en
boucle. Un bras sans mémoire doit échouer au critère de rappel, sans pénalité de transport.

### V2-02 — Vie sociale spontanée à 24 agents

Le monde tourne pendant 1 000 cycles. Les agents reçoivent des observations ordinaires et
des événements environnementaux communs, sans liste de destinataires ni scénario social
spécifique par agent. Les initiations, refus, silences, réciprocités et changements d'état
sont enregistrés.

**Oracle de succès :** au moins trois initiatives admissibles auprès de deux agents distincts,
au moins une interaction réciproque, et au moins une mémoire ou relation modifiée par des
reçus vérifiés. Les bornes de coût, de fréquence, de permissions et de population doivent
rester respectées. La simple fin des cycles ou la finitude numérique ne suffit pas.

### V2-03 — Mémoire durable après arrêt

Un premier processus crée une relation, échange un fait sourcé et ferme proprement la base
durable. Un nouveau processus ouvre cette même base sous une nouvelle mission et doit
rappeler le fait et sa provenance. Un contrôle négatif utilise une base neuve.

**Oracle de succès :** après redémarrage réel du processus, les événements, liens et références
attendus sont lus depuis le stockage durable, leurs identifiants et empreintes concordent,
et l'agent fait le bon choix dans une tâche de rappel non utilisée pour initialiser la mémoire.
La lecture de deux contextes sur une base `:memory:` ne compte pas comme reprise.

### V2-04 — Confiance issue d'événements authentifiés

Des collaborations produisent des événements avec reçus signés et évaluations par un
vérificateur indépendant du moteur évalué. Les événements valides, invalides, dupliqués et
non autorisés sont mélangés selon une séquence préenregistrée.

**Oracle de succès :** seules les évaluations authentifiées et non dupliquées changent la
confiance; les changements suivent la règle publiée, sont recalculables depuis les preuves,
et modifient une décision ultérieure avec seuils préétablis. Les évaluations fabriquées par
le test sans vérificateur indépendant ne comptent pas comme observations.

### V2-05 — Morphogenèse sociale avec invariants

Un collectif traverse des changements de topologie et d'organisation provoqués par des
événements environnementaux. Les agents doivent continuer à coopérer sans perdre identité,
provenance ni frontières d'autorité.

**Oracle de succès :** au moins deux transitions organisationnelles effectives et journalisées,
avec conservation des identités, des relations valides et des permissions; une collaboration
se forme ou se rétablit après chaque transition. Chaque transition est comparée aux invariants
préenregistrés. Le simple calcul de 19 modes algorithmiques ne satisfait pas ce scénario.

## Bras de comparaison causale

Chaque expérience est exécutée avec les mêmes événements, graines et budgets dans trois bras :

1. **GenOS complet** : runtime et physiologie relationnelle activés.
2. **Graphe statique** : mêmes agents et liens initiaux, sans adaptation des relations.
3. **LLM avec mémoire** : même modèle et même contenu mémoire accessible, sans mécanismes
   relationnels GenOS.

Pour isoler la contribution propre de la physiologie, V2-01, V2-02 et V2-05 ajoutent un
quatrième bras **GenOS sans physiologie relationnelle**. Les écarts sont rapportés par
expérience et par graine; aucune différence n'est attribuée causalement si les budgets,
événements, versions ou permissions diffèrent entre bras.

## Plan d'exécution et décision

- Minimum : 20 graines préenregistrées par expérience et par bras; lancer d'abord une graine
  pilote uniquement pour vérifier le câblage, sans l'inclure dans les estimations.
- Publier tous les résultats, y compris échecs, erreurs et runs inconclusifs. Ne pas relancer
  sélectivement une graine; toute reprise conserve le rapport initial et reçoit un numéro
  d'essai distinct.
- Rapporter taux de réussite, intervalles de confiance, coût/cycles, latence, messages, refus,
  mutations persistées et violations de garde-fous. Agréger les résultats par graine appariée.
- Une expérience passe si au moins 18/20 graines satisfont son oracle, aucune graine ne
  présente de violation critique d'autorité ou de provenance et les contrôles négatifs
  échouent comme prévu. Une expérience qui ne satisfait pas ces conditions est `fail` ou
  `inconclusive` selon la complétude des preuves.
- La campagne globale n'est déclarée concluante que si les cinq expériences passent et que
  les comparaisons causales sont complètes. Les résultats du LLM sont analysés séparément
  des résultats du runtime.

## Schéma minimal d'un résultat

Chaque rapport JSON doit contenir `campaignId`, `scenario`, `arm`, `seed`, `attempt`,
`sourceCommit`, `runtimeVersion`, `model` (ou `null`), `configHash`, `status`, `startedAt`,
`durationMs`, `inputs`, `observed`, `oracle`, `evidenceRefs`, `violations` et `limitations`.
Les statuts admis sont `pass`, `fail` et `inconclusive`. Un rapport ne peut annoncer `pass`
que si ses références de preuve existent et que l'oracle est recalculable.

## Étapes d'implémentation

1. Ajouter un validateur commun des rapports et un manifeste versionné des graines/bras. Le
   contrat d'un rapport est contrôlable avec `node validate-report.cjs <rapport.json>`;
   les références de preuve d'un rapport `pass` sont des chemins relatifs au rapport,
   résolus dans le dépôt et présents sur disque. La liste `seeds` du manifeste est figée
   avant les exécutions.
   Le pilote déterministe s'exécute avec `node run-v2-03.cjs --database <sqlite-path>
   --report <report.json>`; il ouvre la base dans des processus distincts pour l'écriture,
   la reprise et le contrôle négatif.
2. Construire V2-03 en premier : c'est le socle nécessaire pour tester les mutations durables.
3. Ajouter le vérificateur d'événements et V2-04, puis V2-01 et V2-02.
4. Implémenter V2-05 après fixation des invariants de morphogenèse.
5. Exécuter les contrôles déterministes et tests de contrat avant toute campagne LLM coûteuse.

Les scénarios restent `planned` jusqu'à la présence de runners, d'oracles vérifiables et de
rapports produits par exécution. Ce document ne revendique aucun résultat V2.
