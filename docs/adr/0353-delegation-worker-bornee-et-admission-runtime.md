# ADR 0353 — Délégation worker bornée et admission runtime

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Domaine** : Autorité, délégation, budgets, P1 L02

## Contexte

Le contrat `sub_orchestrator` permet une délégation de profondeur un. Le
dispatch créait un enfant, mais son admission et Garage exigeaient un parent
en mode orchestrateur. Les anciennes sondes de supervision remplaçaient le
runtime et ne traversaient pas ces frontières. Les réservations cumulatives
de jetons modèle n'étaient pas reliées à une preuve durable de délégation.

## Décision

La création transactionnelle relit le parent, son contrat canonique, le root
orchestrateur, leur tenant, leur autorité actuelle et l'outil de délégation.
Elle réserve un enfant et son plafond de jetons modèle dans le journal GVX
existant : `genos.bounded-worker-delegation/v1`. Le record scelle identités,
scope, mission active éventuelle, contrats, budget, profondeur et expiration.
Les enfants restent limités à scout, bounded, adaptive et verifier workers,
sans permission de déléguer à leur tour. Aucun magasin parallèle n'est créé.

Le nombre d'enfants est l'union des identités persistées et scellées pour ce
parent. Supprimer un enfant ne rend ni son slot ni son allocation disponibles.
L'ordinal durable fournit une identité fraîche. Les plafonds cumulés ne sont
pas des mesures de consommation : les usages effectifs restent dans les
reçus d'exécution. Un exécuteur natif enregistré réserve zéro jeton modèle.

L'admission revérifie le record et les données actuelles avant Cedar. Le
marqueur `boundedDelegationChildId` est construit côté service après cette
vérification, puis limité à cet enfant par la policy. Un argument candidat
ne peut pas fournir ce marqueur de confiance. Garage utilise cette même
admission pour un parent worker. Le bootstrap hérite du contrat du root
lorsque le sous-orchestrateur n'a pas de contrat stratégique propre.

La supervision utilise la capsule créée pour l'enfant. Un statut agent
`completed` et un dossier typé ne suffisent plus : le run d'exécution doit
également être `completed`. Un run bloqué ou en attente d'approbation reste
refusé. Le contrôle de promotion conserve ses exigences de preuves.

Si un événement terminal a déjà scellé un reçu de refus, la défaillance du
runtime reste visible dans la télémétrie sans ajouter une seconde observation
à ce reçu immuable. Le refus initial n'est plus masqué par
`BIOLOGICAL_WORKER_RECEIPT_SEALED`.

## Vérification et limites

La sonde SQLite complète traverse les services réels, Garage, une capsule
GenOS et le calcul natif subset sum. Elle observe le témoin `[0, 2]`, la somme
10 et zéro jeton modèle. Le contrat par défaut refuse ensuite la promotion
faute de vérification indépendante. Ce résultat qualifie l'exécution et le
refus, pas une décision métier vérifiée ou un parcours positif complet.

Une sonde à deux connexions maintient une réservation ouverte : la seconde
attend, puis refuse un cumul supérieur à 10 000 jetons et annule l'insertion
de l'enfant. Expiration, changement de contrat, membership retiré, autorité
du root refusée, reprise sur nouvelle connexion et plafond de cinq identités
à vie sont également contrôlés.

Les effets de copie du workspace ne deviennent pas transactionnels avec
SQLite. La réservation cognitive existante est distincte des jetons modèle.
Les appels directs, le confinement OS, la révocation sous toutes les races,
l'idempotence d'une requête complète et les oracles métier restent à qualifier.
Une mission sans réservation d'autorité conserve son état historique
`lease: null`. Cette extension ne clôture ni L02 ni P1.
