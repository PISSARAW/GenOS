# Runtime Biome

Le runtime assemble les onze variantes dans une boucle écologique bornée et persistante.
L'architecture est décrite dans [ADR 0334](../adr/0334-biome-boucle-ecologique-transactionnelle.md).

## Cycle et reprise

`BiomeRuntime.create(mission, options)` compose une session avec un environnement.
Les quatre rôles écologiques sont le plan de contrôle. Les niches et populations sont
créées depuis des opportunités documentées ou une incertitude explicitement justifiée.

`step(input)` effectue un cycle atomique ; `run(input, maxTicks)` le répète jusqu'à
l'arrêt ou la limite. Une fonction asynchrone d'entrée peut fournir des observations
différentes à chaque tour. `restore(sessionId, variant, db)` reprend la progression
SQLite et refuse un changement de variante. `getState()` retourne une copie.

Une révision attendue protège des observations périmées. Un cycle refusé ne modifie
ni la session, ni les ressources, ni la matrice. Les réservations et complétions
d'exécution ont leurs propres révisions, distinctes du compteur de cycles.

Les limites de cycles sont des entiers entre 1 et 10 000. Les arrêts comprennent
budget épuisé, limite atteinte, extinction globale, stérilité, annulation, échéance
et objectif vérifié. Une mission inactive atteint sa limite ; elle ne réussit pas.

## Entrées observées

| Champ | Effet |
| --- | --- |
| `environmentPatch`, `evidenceRefs` | Versionne l'environnement et reconstruit ses opportunités. |
| `individuals` | Recrute les individus compatibles dans les niches ouvertes. |
| `populationCommands` | Création, sélection, migration, mutation, dormance, consommation, adaptation. |
| `populationResults` | Intègre productivité, coûts, fitness, artefacts et traces une seule fois par identité. |
| `interactions` | Modifie les liens à partir de leur effet mesuré et documenté. |
| `resources` | Crédit initial du vecteur de ressources, appliqué une seule fois. |
| `totalBudget`, `tokenCost` | Plafond initial et consommation scalaire explicite ; ne représentent pas une allocation. |
| `executions` | Requêtes d'opérations sur des individus actifs et des adaptateurs configurés. |

Une alternative de foraging peut fournir un objet `operation` contenant
`providerId`, `capability`, `resources` et `input`. Le runtime sélectionne
un individu compatible, exécute cette opération après migration et rattache
son reçu à la demande de patch. Une opération absente ou seulement descriptive
reste une requête externe.

Un résultat possède `id`, `populationId`, une `productivity` finie et positive
ou nulle, et des `evidenceRefs`. Ses `resources` débitent les soldes et le budget.
`predictionError` alimente le progrès d'apprentissage. Un `environmentPatch`
attaché au résultat construit l'environnement dont les niches seront découvertes
au cycle suivant. Les références sont des observations fournies, sans certification
automatique de leur contenu.

Les dimensions de ressources sont tokens, coût, quota, CPU, GPU, RAM et énergie.
Les réserves de récupération, vérification et exploration sont distinctes.
Les mesures exposent soldes, réserves, budget réellement utilisé et quarantaine.
La capacité distingue un plafond déclaré d'une estimation calculée ; zéro connu
n'autorise pas de recrutement. Les individus retirés restent dans l'archive dormante. Un changement des
capacités requises d'une opportunité archive les individus devenus incompatibles.

## Exécution concrète et preuve

Un adaptateur est configuré par du code de confiance, jamais par une fonction
envoyée dans un argument JSON MCP. Exemple depuis la racine du dépôt :

```javascript
const registry = require('./backend/src/services/biome/runtime/executionAdapterRegistry');
const unregister = registry.registerProvider('local', {
  authorize: async ({ request }) => request.capability === 'calculate',
  execute: async request => ({
    output: request.input.left + request.input.right,
    consumed: { tokens: 2 }
  }),
  verify: async proof => ({
    sessionId: proof.sessionId,
    executionId: proof.executionId,
    outputDigest: proof.outputDigest,
    verified: proof.output === 4,
    evidenceRefs: ['test:arithmetic']
  })
});
```

L'hôte remplace l'exemple arithmétique par l'opération et le vérificateur adaptés.
Une requête contient `executionId`, `populationId`, `individualId`,
`providerId`, `capability`, `resources` et `input`.

L'autorisation doit retourner exactement `true`. Le runtime réserve avant
d'appeler le fournisseur, transmet le phénotype, la recette cognitive et le patch
de l'individu, puis rembourse la partie inutilisée. Un coût supérieur à la
réservation est enregistré et interdit une preuve de succès. L'absence de fournisseur
ou d'autorisation produit une abstention. Une réponse transportée peut rester
`unverified`. Un fournisseur défaillant consomme conservativement sa réservation.
Une identité rejouée retourne son reçu ; un changement de requête sous cette
identité est refusé. Une réservation interrompue ne déclenche pas une seconde exécution.
Les callbacks sont bornés à 30 secondes par défaut, configurables par
`executionTimeoutMs`. Un timeout transmet un AbortSignal et laisse une exécution
indéterminée, sans rejeu ; le fournisseur doit respecter le signal pour stopper
ses effets externes.

Le vérificateur global `options.verifyGoal` doit retourner `verified: true`,
`sessionId`, le `tick` courant et des références de preuve. Une couverture
fonctionnelle incomplète, une santé stressée ou une extinction globale l'invalident.
Le résultat `goalVerified` reste séparé des actions et des mesures écologiques.

## Mécanismes assemblés

| Mécanisme | Effet dans la boucle |
| --- | --- |
| Niches dynamiques | Découverte depuis opportunités, échecs et sources documentées. |
| Qualité-diversité | Contrôleur grille/CVT et archive de pistes non dominées. |
| Métabolisme | Allocation distincte des consommations et réservations réelles. |
| Foraging | Décision suivie de migration de patch et coût comptabilisé. |
| Capacité | Réduction des populations et conservation des individus dormants. |
| Biofilm | Traces mesurées, décroissance et réutilisation au tour suivant. |
| Naissance/mort/migration | Opérations de population validées par niche. |
| Succession | Transition conditionnée aux observations et à la stabilité. |
| Construction | Résultats mesurés modifiant l'environnement versionné. |
| Résilience | Réserve, refuges, extinction confirmée et nouvelles mesures de récupération. |
| Rewiring | Liens documentés dont la valeur influence l'allocation. |
| POET/NCE | Environnements candidats bornés et niches ouvertes depuis résultats documentés. |
| Curiosité | Progrès d'apprentissage observé, avec pénalité des domaines sans progrès. |
| Phénotype | Adaptation limitée à stratégie, focus, température et taux d'apprentissage. |
| Stepping stones | Archives de pistes, artefacts et individus préservés. |
| Stigmergie | Gradients de traces utilisés directement par les alternatives de foraging. |

La sélection d'un fournisseur Compute est une demande. Un champ `computeWork`
avec identité d'exécution, population, individu, capacité, ressources et entrée
raccorde directement le fournisseur choisi à un adaptateur autorisé. Sans ce
travail concret, la sélection reste une recommandation. Les expérimentations
adversariales restent des scénarios abstraits bornés. Les mesures de qualité,
les sources et les évaluations de nouveaux environnements viennent des outils
et vérificateurs de l'hôte.

## MCP et missions

`genos_topology_session` avec `topology: "biome"` accepte `operation: "cycle"`
ou `operation: "run"`, `session_id`, `variant_input`, `max_ticks` et
`expected_revision`. Les commandes unitaires restent disponibles.
`run` continue la même session ; il ne compose pas une session indépendante.

Les missions du plugin morphogenèse utilisent le même runtime avec les individus
des workers réellement fournis et leurs résultats. Aucune productivité synthétique
n'est créée à partir de la présence d'un worker.

Pour une portée persistante, `persistenceKey` conserve niches, populations,
ressources, saisons et biofilm entre missions. Le nouveau budget et les preuves
globales repartent à zéro. Les identités de résultats restent protégées contre le rejeu.

## Validation

```bash
npm --prefix backend run test:biome
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

La suite Biome inclut une reprise SQLite réelle et des opérations locales exécutées.
Elle ne constitue pas une preuve de supériorité scientifique face à un orchestrateur
statique ; cette affirmation nécessite une campagne comparative à budget égal.
