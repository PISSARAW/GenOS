# Continuité d’identité et réutilisation de calibration

La [campagne du 2026-11-02](../../docs/06-qualite-preuves/identite-filiation-apprentissage-2026-11-02.md)
documente les mesures exécutées et leurs limites.

Ce benchmark exécute les services de production de GenOS dans une base SQLite
isolée. Il mesure une propriété fonctionnelle du registre et de la frontière
cognitive, sans appel LLM et sans autorité de promotion.

```powershell
node benchmarks/identity-continuity/test.cjs
node benchmarks/identity-continuity/run.cjs
```

Les résultats sont écrits sous `results/<date>/` et restent ignorés par Git.
Un dossier de sortie déjà utilisé est refusé. Le manifeste capture avant toute
mesure le protocole et son SHA-256, la révision Git, l’état du checkout, les
empreintes des sources pertinentes, Node et la plateforme. Une modification
de ces sources ou de HEAD pendant la campagne provoque un échec. Les requêtes,
traces individuelles, bases, journaux et échecs restent disponibles.

Le protocole fixe trois graines, chacune avec 600 transformations du registre
(nom, rôle, modèle, révision cognitive) et 600 épisodes exécutés puis enregistrés
par `identity.decisions`. Chaque tranche de 100 épisodes et chaque fenêtre
d’évaluation tournent dans un nouveau processus. Il ne s’agit pas d’une
restauration de fichiers ni d’une mutation des poids d’un modèle.

Douze forks directs et une chaîne de douze descendants supplémentaires sont
enregistrés avec les mêmes attributs initiaux. `identity.checkpoints.fork` scelle
leurs origines. `identity.peers` reconnaît leur identité signée; `familyHistory`
restitue leur ascendance, comparée aux ancres vérifiées du registre. Un individu
sans parent sert de contrôle. Le terme fork désigne ici un nouvel individu à
origine attestée, sans copie complète de son organisme.

Les contrôles négatifs couvrent signature modifiée, présentation de soi comme
pair, rejeu, présentation périmée, ancienne incarnation, changement d’identifiant,
modification du journal et franchissement de périmètre. Les épisodes hérités
gardent leur auteur d’expérience initial et ne deviennent pas des observations
personnelles du descendant.

L’apprentissage porte sur la fiabilité de quatre domaines d’arithmétique. Un
exécuteur rapide utilise des entiers signés 32 bits; un second calcule en décimal
chiffre par chiffre. L’oracle séparé utilise `BigInt`. Aucun succès n’est injecté
comme une constante : chaque résultat rapide est réellement comparé à l’oracle.
La mémoire personnelle calibre la probabilité de réussite par domaine; la
frontière `identity.modelBoundary` fournit l’incertitude au contrôleur du
benchmark, qui choisit le second exécuteur au-delà du seuil fixé de 0,65.

Après entraînement, trois fenêtres de 200 nouveaux problèmes s’exécutent sans
écriture d’apprentissage. Leurs opérandes et identifiants sont distincts de ceux
de l’entraînement. Les mêmes tâches alimentent quatre bras : mémoire utilisée,
mémoire désactivée, associations de domaines permutées, vérification systématique.
Vingt appels supplémentaires par fenêtre vérifient l’absence de calibration
inventée dans un domaine inconnu. Le score de Brier porte sur la réussite de
l’exécuteur rapide, indépendamment de la correction obtenue par audit.

Le coût est une unité synthétique par exécuteur invoqué; il ne mesure ni euros,
ni tokens, ni temps réel. Les 600 essais d’entraînement coûtent aussi 600 unités
par graine : le rapport de coût des seuls tests ne prouve pas un amortissement
global de l’apprentissage. Le choix du contrôleur reste écrit dans le harness;
la mémoire de calibration et sa consommation par la frontière sont réelles.

La campagne démontre au mieux une continuité causale, une reconnaissance
authentifiée, une filiation restituée et une calibration réutilisée sur de nouveaux
exemples des mêmes domaines. Elle ne démontre pas une identité psychologique,
une conscience, une cognition LLM autonome, une généralisation à une nouvelle
famille de tâches, une résistance à toutes les attaques ou une stabilité sur
plusieurs jours. Les graines ne sont pas des agents LLM indépendants.
