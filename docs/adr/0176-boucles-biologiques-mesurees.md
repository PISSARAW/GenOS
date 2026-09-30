# ADR 0176 — Boucles biomimétiques runtime mesurées

- **Statut** : Accepté — intégration par tranches, sans promotion de maturité implicite
- **Date** : 2026-09-30
- **Domaine** : Perception, action, signalisation, cellules spécialisées, preuves
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0004, ADR 0039, ADR 0162, ADR 0163

## Contexte

La grille de maturité conserve principalement les comportements de foraging,
les sens simulés et les cellules spécialisées au niveau « primitive ». Les
fonctions locales ne prouvent ni l'observation d'un système réel, ni l'effet
d'une action autorisée, ni la performance d'une boucle complète. Le foraging
possède un chemin MCP vers un service navigateur, mais une décision de départ
sans navigation pouvait encore être présentée comme une exécution terminée.
Les adaptateurs sensoriels et les cellules spécialisées doivent rester soumis
aux mêmes exigences de provenance, d'autorité et de preuve.

## Décision

Les capacités biomimétiques ne sont promues qu'après intégration de leurs
interfaces runtime et exposition d'un reçu mesuré. Chaque tranche suit ce
contrat :

1. **Perception** : une source runtime explicite émet un signal typé avec sa
   provenance et son instant de lecture. Les valeurs fournies par un appelant
   restent marquées comme synthétiques.
2. **Arbitrage** : la politique transforme les observations en décision
   explicite, avec ses entrées, paramètres et motif.
3. **Action** : tout effet passe par un adaptateur concret et un outil autorisé
   par la lease active. La décision, à elle seule, n'est jamais un effet.
4. **Mesure et preuve** : le reçu distingue action exécutée, observation seule,
   refus et échec. Il conserve durée monotone, résultat observé et référence
   d'intégrité au chemin d'appelant. Une mesure locale ne devient pas une
   validation de capacité.
5. **Promotion** : « intégrée » exige un chemin runtime réel et lease. « Validée »
   exige en plus un protocole reproductible avec commande, seed et artefacts.

Le foraging commence cette transition : observer la session navigateur, calculer
le rendement marginal, décider de rester ou partir, puis effectuer une navigation
si elle est demandée et fournie. Une étape sans URL reste une décision non
exécutée. Le handler MCP reporte fidèlement l'issue et le reçu expose la durée
du pas; sa persistance durable et la validation reproductible restent requises
avant toute promotion.

Les adaptateurs des sens réutilisent des modalités fermées (`pheromone`,
`thermal`, `magnetic`, `acoustic`, `visual`, `error`) et doivent joindre une
source et une provenance. Les cellules spécialisées ne peuvent revendiquer un
branchement réel que lorsqu'un adaptateur les relie à un point d'entrée ou un
service réel. Les effets à privilège sont appelés par un outil sous lease; une
méthode locale de l'écosystème ne constitue pas cette autorisation.

## Conséquences

### Positives

- Les décisions et les effets ne sont plus confondus dans les reçus.
- Les valeurs synthétiques peuvent coexister avec les lectures runtime sans
  être présentées comme des observations réelles.
- Les niveaux de maturité restent indexés sur des preuves conservées.

### Négatives

- Chaque adaptateur doit maintenir provenance, mesure et contrat de lease.
- L'ajout d'un reçu ne suffit pas à promouvoir une capacité : les essais
  reproductibles et leurs artefacts restent nécessaires.

## Tranches d'implémentation

- **Foraging** : première tranche de boucle d'observation/décision/action,
  durée mesurée et reçu d'intégrité; action absente ou échouée correctement
  reflétée par le handler. Persistance et protocole reproductible à compléter.
- **Sens** : adaptateurs concrets vers des sources runtime, typage explicite et
  provenance par lecture; aucune donnée d'entrée libre n'est renommée en
  observation réelle.
- **Cellules spécialisées** : branchement sur des services ou points d'entrée
  réels, instrumentation de latence/débit/erreurs adaptée à chaque cellule, et
  preuves d'autorisation/refus sous lease.
- **Promotion** : mise à jour de la grille seulement après examen du chemin de
  code et des artefacts correspondant au niveau revendiqué.

## Alternatives

- Promouvoir les modules après ajout d'une route MCP : rejeté, car la route ne
  prouve ni effet réel ni mesure.
- Utiliser un type générique de signal sans provenance : rejeté, car une valeur
  fournie par l'appelant deviendrait indiscernable d'une observation.
- Traiter une lease valide comme une preuve d'exécution : rejeté, car elle
  autorise l'appel sans démontrer son effet.
