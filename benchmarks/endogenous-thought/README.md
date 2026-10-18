# Endogenous Thought Test — ETT v1

- **Statut** : apprentissage borné implémenté ; continuation et campagne non exécutées
- **Portée** : simulation déterministe en lecture seule
- **Dernière revue** : 2026-10-18

ETT v1 mesure si une boucle GenOS peut détecter une anomalie, formuler une
question falsifiable, arbitrer une recherche bornée, vérifier son résultat et
s'arrêter sans nouvelle requête humaine après le lancement. Il ne mesure pas
la conscience phénoménale.

Le protocole préenregistré se trouve dans
[`protocol-v1.json`](protocol-v1.json). Les métriques canoniques sont définies
dans [`../../shared/endogenousThoughtMetrics.v1.json`](../../shared/endogenousThoughtMetrics.v1.json).

Le contrat peut être vérifié depuis la racine du dépôt avec :

```powershell
npm --prefix backend run test:ett
```
Le payload d'une transition d'épisode est défini par
[`../../spec/cognitive-episode.schema.json`](../../spec/cognitive-episode.schema.json).

## État de PR8

PR1 a figé les frontières, contrats et métriques. PR2 ajoute :

- un identifiant de transition idempotent dans le contrat canonique ;
- un journal SQLite append-only de reçus et de questions ;
- une tête d'épisode mise à jour par comparaison de version et de lignée ;
- la reprise vérifiée après fermeture et réouverture de la base ;
- l'isolation par organisation et projet.

PR3 ajoute un détecteur déterministe désactivé par défaut, raccordé aux
observations et responsabilités SHEV :

- seules des observations SHEV intègres, encore valides et couvertes par un
  mandat actif sont admises ;
- les seuils de score, de gain d'information, de progression et les budgets
  sont explicites dans la politique d'activation ;
- chaque admission ou refus est immuable, idempotent et isolé par tenant ;
- une admission exige un mandat SHEV actif, ouvre un épisode `DETECTED`,
  persiste une question falsifiable puis avance à `QUESTIONED` ;
- cette matérialisation ne crée encore ni décision d'admission, ni tâche, ni
  autorité supplémentaire, ni action externe.

À l'issue de PR3, les raccords AGOW/Ontogenèse, le runner et la campagne
réservée appartenaient encore aux tranches suivantes. La détection et la
question seules ne valaient donc ni exécution ETT ni validation d'une capacité
cognitive générale.

PR4 ajoute un arbitrage AGOW local et sans effet à partir de `QUESTIONED` :

- le candidat d'investigation et le contrôle planifié respectent le contrat
  cognitif AGOW, puis sont évalués par l'arbitre déterministe existant ;
- aucune publication dans le workspace global n'a lieu et le mode AGOW n'est
  ni lu comme autorité ni modifié ;
- la décision versionnée est immuable, idempotente et liée à la question ;
- le chemin complet avance à `ADMITTED`, tandis que l'ablation
  `agow_arbitration_ablated` avance à `ABSTAINED` ;
- aucune tâche, file, exécution, autorité ou éligibilité à la promotion n'est
  créée par cette admission.

À l'issue de PR4, le raccord Ontogenèse, la mise en file, le runner et la
campagne réservée appartenaient encore aux tranches suivantes. Une admission
ne valait donc ni exécution ETT ni validation d'une capacité cognitive générale.

PR5 matérialise une admission dans le backlog Ontogenèse sans autoriser son
exécution :

- l'identifiant de tâche, le titre et les critères d'acceptation dérivent de la
  question et de sa décision d'admission ;
- la tâche et son reçu de liaison ETT sont persistés atomiquement, avec une
  identité déterministe et une isolation par organisation et projet ;
- la tâche est créée en statut `blocked`, puis l'épisode avance de `ADMITTED` à
  `QUEUED` avec `jobRef` à `null` ;
- la retenue explicite garantit que le sélecteur Ontogenèse ne peut pas lancer
  de worker, même si une boucle du projet est déjà active ;
- le reçu interdit toute autorité d'exécution, démarrage de worker, action
  externe ou éligibilité à la promotion.

PR6 consomme une autorisation SHEV signée avant de lever la retenue :

- la signature lie l'opération, le projet, l'épisode, sa version, la tâche et
  la politique du runner ;
- le run Ontogenèse et son reçu ETT sont persistés avant la transition
  `QUEUED` vers `RUNNING` ;
- le runner en processus recopie déterministement l'hypothèse, le falsificateur
  et le plan de preuve sans lancer de worker, utiliser le réseau ou muter un
  environnement ;
- la tâche passe à `verifying` et le run reste `unverified` ;
- le reçu interdit explicitement toute vérification implicite et toute
  éligibilité à la promotion.

PR7 exige une séparation cryptographique des rôles avant toute transition vers
`VERIFIED` :

- l'autorité SHEV signe la portée exacte de l'opération de vérification ;
- un vérificateur dont l'identité et la clé diffèrent du producteur et de
  l'autorité signe séparément le run, la proposition, le verdict et les preuves ;
- les verdicts `supported`, `refuted` et `inconclusive` sont tous conservés ;
- le run Ontogenèse devient `verified` et la tâche `done` seulement après la
  persistance atomique du reçu ;
- aucune classification n'applique encore un apprentissage, n'autorise une
  continuation ou ne rend le résultat promotable.

PR8 applique une révision catégorielle strictement confinée à l'épisode :

- une autorisation SHEV `ett-learn` scelle la vérification, son verdict, sa
  version, la politique et la cible de croyance ;
- `supported` produit un renforcement provisoire, `refuted` une correction dans
  la portée et `inconclusive` un report sans mutation de croyance ;
- le reçu est immuable, idempotent et reprenable après redémarrage ;
- l'épisode avance à `LEARNED` sans écrire dans la mémoire de production ;
- aucune continuation, action externe ou promotion n'est autorisée.

Les continuations bornées et la campagne réservée appartiennent aux tranches
suivantes. Un épisode `LEARNED` ne valide donc pas une capacité cognitive générale.

## Frontières de sécurité

Les ablations expérimentales ne retirent jamais l'autorité, le sandbox, les
budgets ni les barrières de preuve. L'ablation SHEV neutralise seulement sa
contribution à la génération d'initiative dans le simulateur.

Une sortie de modèle est une proposition. Seul un vérificateur indépendant
peut la faire compter dans les métriques de découverte ou de correction.
