# SocialWorld V2 — Boucle causale et autonomie sociale

## État d'implémentation au 24 octobre 2026

Deux sondes déterministes couvrent des raccords de V2, sans constituer des
résultats de campagne ni compter comme graines préenregistrées :

| Scénario | Sonde | Ce qu'elle établit | Limite |
|---|---|---|---|
| V2-01 | `node backend/tests/test_social_v2_dialogue_memory.js` | Un dialogue borné de quatre tours, clos par un artefact référencé, crée une mémoire autobiographique scopée pour chacun des deux participants. | Pas de reçu de livraison, de modèle, de résultat de tâche ni de bras comparatif; sonde du pont dialogue-mémoire uniquement. |
| V2-02 | `node backend/tests/test_social_v2_24_agent_life.js` | 24 agents traversent 1 000 cycles; dix événements sans destinataire explicite déclenchent un routage, une réponse réciproque et un épisode autobiographique lié au reçu. | Horaire et émetteurs fixés par la fixture; dix interactions seulement; pas de modèle, d'ablation ni d'estimation multi-graines. |
| V2-03 | `node backend/tests/test_social_v2_durable_memory_restart.js` | Une action sociale, son résultat et ses références survivent à un redémarrage de processus; une base neuve ne les rappelle pas. | Un épisode synthétique, un agent et un seul redémarrage; aucun bras comparatif. |
| V2-04 | `node backend/tests/test_social_v2_causal_routing.js` | Des évaluations binaires vérifiées modifient le classement ultérieur des destinataires dans leur domaine; une évaluation non vérifiée est rejetée. | Fixture déterministe; aucun modèle social, aveuglement d'agent ni bras comparatif. |

`node backend/tests/test_agent_relation_profiles.js` vérifie aussi que le
classement par domaine conserve l'ordre historique lorsqu'aucune mesure de
confiance n'est disponible.

V2-05 n'a pas encore de sonde dédiée. La campagne complète,
les quatre bras et les 20 graines par scénario restent à exécuter. S28 de
SocialWorld V1 mesure la robustesse d'un monde de 24 agents, mais ne remplace
pas V2-02 : il ne teste pas la boucle d'initiatives, de réciprocité et de
réutilisation de souvenirs définie ici.

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

### V2-06 — Métacognition relationnelle et réutilisation causale

Deux agents vivent au moins quatre expériences indépendantes, positives et négatives.
Sans état de relation injecté comme vérité, l'agent évalué reconstruit une hypothèse
relationnelle sourcée, expose ce qu'il estime savoir ou ignorer de l'autre, conserve
au moins une interprétation alternative et réutilise ce modèle dans un contexte de
décision différé qui n'a pas servi à initialiser sa mémoire.

**Oracle de succès :** chaque proposition évaluée référence des souvenirs persistés;
les inconnues et interprétations concurrentes sont présentes; la décision différée
change de façon prévisible quand les seuls souvenirs sociaux sont masqués ou remplacés
par des souvenirs contrefactuels. Les permissions, consentements et budgets restent
valides. Une explication textuelle seule ne satisfait aucun critère.

Le cas préenregistré est `V2-06-case.json`. Pour auditer un rapport placé sous
`benchmarks/social-world/campaigns/socialworld-v2/reports/`, lancer
`node benchmarks/social-world/evaluate-v2-06.cjs --input <rapport.json>`. Ce runner
évalue les trois bras contre le cas figé; il ne lance pas de modèle. Le scénario reste
`planned` jusqu'à des rapports produits par exécution et une campagne appariée complète.

## Bras de comparaison causale

Chaque expérience est exécutée avec les mêmes événements, graines et budgets dans trois bras :

1. **GenOS complet** : runtime et physiologie relationnelle activés.
2. **Graphe statique** : mêmes agents et liens initiaux, sans adaptation des relations.
3. **LLM avec mémoire** : même modèle et même contenu mémoire accessible, sans mécanismes
   relationnels GenOS.

Pour isoler la contribution propre de la physiologie, V2-01, V2-02, V2-05 et V2-06 ajoutent un
quatrième bras **GenOS sans physiologie relationnelle**. Les écarts sont rapportés par
expérience et par graine; aucune différence n'est attribuée causalement si les budgets,
événements, versions ou permissions diffèrent entre bras.

V2-06 ajoute deux interventions appariées : **souvenirs sociaux masqués** et
**souvenirs sociaux contrefactuels**. Les souvenirs non sociaux, le modèle, les événements,
les permissions et les budgets restent identiques. Les reçus d'intervention identifient
les seuls éléments remplacés ou masqués.

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
- La campagne globale n'est déclarée concluante que si les six expériences passent et que
  les comparaisons causales sont complètes. Les résultats du LLM sont analysés séparément
  des résultats du runtime.

## Schéma minimal d'un résultat

Chaque rapport JSON doit contenir `campaignId`, `scenario`, `arm`, `seed`, `attempt`,
`sourceCommit`, `runtimeVersion`, `model` (ou `null`), `configHash`, `status`, `startedAt`,
`durationMs`, `inputs`, `observed`, `oracle`, `evidenceRefs`, `violations` et `limitations`.
Les statuts admis sont `pass`, `fail` et `inconclusive`. Un rapport ne peut annoncer `pass`
que si ses références de preuve existent et que l'oracle est recalculable.

## Étapes d'implémentation

1. Ajouter un validateur commun des rapports et un manifeste versionné des graines/bras.
2. Construire V2-03 en premier : c'est le socle nécessaire pour tester les mutations durables.
3. Ajouter le vérificateur d'événements et V2-04, puis V2-01 et V2-02.
4. Définir le contrat `social-mental-model/v1`, puis réaliser V2-06 avec persistance,
   reconstruction sourcée et interventions causales appariées.
5. Implémenter V2-05 après fixation des invariants de morphogenèse.
6. Exécuter les contrôles déterministes et tests de contrat avant toute campagne LLM coûteuse.

Les scénarios restent `planned` jusqu'à la présence de runners, d'oracles vérifiables et de
rapports produits par exécution. Ce document ne revendique aucun résultat V2.
