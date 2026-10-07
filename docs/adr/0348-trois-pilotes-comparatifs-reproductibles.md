# ADR 0348 — Trois pilotes comparatifs reproductibles

**Statut** : Accepté
**Date** : 2026-10-07
**Domaine** : Évaluation, modèles, mémoire et preuves

## Contexte

B05 disposait de sondes sandbox sans cohortes réservées ni comparaison IA
reproduite. Un succès AEIS ne suffit pas à établir un gain de capacité. Le
provider n'exposait pas les contrôles de température et de contexte requis,
et estimait l'usage des réponses Ollama natives malgré leurs compteurs réels.

## Décision

Livrer sous `benchmarks/p0-pilots/v1` trois cohortes synthétiques versionnées,
avec séparation apprentissage/développement/réservé, oracles distincts,
baselines, ablations et budgets plafonnés identiques par pilote. Figer une
capsule avant les inférences réservées et demander à un second opérateur de
la reproduire, sans consultation des scores primaires ni modification.

Transmettre explicitement température, contexte et graine à Ollama natif,
en conservant la température zéro. Refuser les contrôles non pris en charge
plutôt que les ignorer. Exposer séparément le caractère mesuré de l'usage ;
les compteurs natifs ne créent aucun reçu signé ni identité de réponse fictive.

Séparer la sélection publique de l'adjudication réservée Python. Le code
candidat est limité à une grammaire numérique ; Lean vérifie un énoncé
immuable avec audit des axiomes ; le pilote mémoire utilise les services réels
et un contrôle brut disposant du même corpus de fond. Les ablations retirent
la sélection par preuve, les candidats indépendants, le retrieval ou la
frontière de confiance selon le pilote.

## Alternatives

Réutiliser uniquement les sondes de contrat ne mesurerait pas des sorties IA.
Assimiler ces petits pilotes aux six suites scientifiques préexistantes
élargirait indûment leur portée. Un simple deuxième lancement par le même
opérateur ne démontre pas une reproduction indépendante.

## Conséquences

Les plafonds identiques permettent une comparaison bornée ; les consommations
réelles et les délais sont publiés. Le remplissage mémoire égalise les octets,
pas les tokens. Les différences de contenu et de longueur demeurent des limites
de l'attribution causale. Les candidats indépendants du runner n'impliquent
aucune utilisation de l'API de bifurcation des lignées GenOS.

Huit tâches par pilote, un modèle local et une reproduction sur le même hôte
autorisent une qualification exploratoire du protocole, sans généralisation
ni promotion automatique. La capsule vérifie ses dépendances liées avant/après,
mais ne les rend pas immuables au niveau du système. Les reçus exécutables et
les résultats conservés hors Git fondent le rapport de qualification.
