# ADR 0402 — Exécution publique explicite de Biocénose

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : Biocénose, MCP, délibération persistante
- **Décideurs** : équipe GenOS
- **Lié à** : [cycle persistant](0333-biocenose-cycle-persistant-et-finalisation.md), [barrière de preuve](0288-barriere-de-preuve-des-missions-topologiques.md)

## Contexte

La composition biologique créait une communauté Biocénose, mais le chemin
`genos_biological_mode` ne lançait pas son cycle de délibération. La sélection
automatique du variant pouvait différer entre la formation des membres et la
constitution engagée. Un statut de transport ou de cycle terminé ne prouve pas
que le jugement a franchi ses gates de preuve.

## Décision

La préparation classe la question et choisit le variant avant la formation.
Elle emploie le même identifiant pour les membres, la constitution et l'appel
au runtime. Les incompatibilités sont rejetées avant de créer une communauté.

Le paramètre booléen `execute_round` de `genos_biological_mode` déclenche
explicitement la délibération persistante pour Biocénose seulement. Sa valeur
absente ou `false` conserve la seule composition. L'exécution appelle les
handlers réels et le routeur de modèles ; elle n'invente ni ballot, ni oracle,
ni validation humaine. Les exécuteurs et validateurs externes ne sont pas
constructibles à partir d'un argument JSON public. Leur absence suit les
refus ou escalades du runtime.

La réponse distingue `cycleStatus`, `communityStatus`, `followUpStatus` et
`judgment.status`. Elle inclut `communityId`, le variant, les références
empreintées des reçus et le jugement enregistré. Le statut
`topology_cycle_recorded` signifie que le cycle a été enregistré, non qu'une
promotion a été autorisée. Si le runtime échoue après la préparation, la
réponse d'erreur conserve `communityId` pour inspection et reprise par les
interfaces autorisées.

## Conséquences

- La composition et l'exécution sont des actions distinctes et visibles.
- Le variant automatique commande réellement la formation spécialisée.
- Un cycle factuel peut rester `REVIEW_REQUIRED` sans oracle de confiance ;
  une décision normative peut attendre un humain.
- Cette interface ne fournit pas encore une reprise publique par `communityId`
  ni le raccordement du contrôleur générique de Morphogenèse au journal
  Biocénose. Ces raccordements exigent une autorité de session explicite.

## Alternatives

- Exécuter automatiquement après chaque composition : rejeté, car composer
  les membres n'autorise pas implicitement les appels modèles et leurs coûts.
- Produire des ballots ou reçus déterministes de substitution : rejeté, car
  cela contournerait les gates de preuve.
