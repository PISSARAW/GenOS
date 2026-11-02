# ALLOSTASIE : contention, consommation mesurée et reprise

- **Statut** : Démonstrateur exécutable du profil expérimental Node
- **Date** : 2026-11-02
- **Portée** : Deux clients, un régulateur et un fournisseur, en quatre processus

## Exécution

Depuis la racine :

```powershell
npm --prefix backend run test:allostasis-protocol
```

Le scénario seul se lance avec
`node backend/tests/test_allostasis_protocol_process_recovery.js`.
Les neuf fichiers de tests couvrent contrat, qualification native, registre
d'observations, allocation, concurrence, consommation, transitions et reprise.
Les temporaires suivent `os.tmpdir()` ; cette campagne a fixé `TEMP` et `TMP`
sur un volume de test disposant d'espace, uniquement pour les processus lancés.

## Mesures, prévisions et décision

Les états des quatre niveaux sont réellement persistés via les services AGOW
natifs. Le démonstrateur utilise des diagnostics de fixture explicitement
déclarés, pas des mesures physiques d'énergie ni une preuve de viabilité.
Les mappings locaux conservent unités, provenance, valeur brute, incertitude
et quantification des ratios. Une valeur absente ou périmée reste indisponible.

Le candidat est construit avec l'adaptateur AGOW existant, puis son assessment
est produit par le calcul natif de regret allostatique. L'horizon reste exprimé
en cycles ; aucune durée en millisecondes n'est inventée à partir des cycles.
La quantité de ressource demandée reste une **demande déclarée**, distincte de
la prédiction de viabilité et d'une consommation observée.

Les clients possèdent chacun leur journal SQLite. Ils émettent
`REPORT_STATE`, `FORECAST_NEED`, puis `REQUEST_BUDGET`. Le régulateur journalise
et requalifie les sources natives sous la portée, la mission, la conversation,
les acteurs et les références exactes. La prévision doit citer le rapport réel,
et la demande doit citer la prévision enregistrée. La décision de réserver
reste séparée de ces observations.

## Dernière capacité disponible

Le pool dispose de 10 000 millisecondes de quota, dont 2 000 protégées.
Deux clients demandent simultanément les 8 000 unités ordinaires restantes.
La transaction autoritative produit exactement un `GRANT` et un `REJECT`.
L'état du pool, l'allocation et l'outbox sont commités ensemble. Les réponses
sont acheminées vers les journaux clients, puis rejouées sans doublon.

Une déclaration `PRESSURE` du client refusé ne change pas le pool et n'accorde
aucun budget. Un client qui émet lui-même un `GRANT` est refusé.
La réserve protégée n'est pas allouable dans ce profil initial, même par une
exposition marquée `recovery` ; une politique dédiée devra régir cet usage.

Le test vérifie aux étapes d'admission :

```text
consommé + retenu + réserve protégée <= capacité
```

Il ne qualifie pas une stratégie optimale d'allocation. L'ordre de traitement
des demandes est une politique du régulateur, évaluable séparément.

## Exposition et travail réellement mesuré

Avant le travail, le régulateur persiste une intention d'exposition bornée par
l'allocation. Cette intention n'est pas un dispatch ni, à elle seule, une
autorisation d'effet externe. Le superviseur de test commande séparément le
fournisseur local par son canal autorisé.

Le fournisseur possède une quatrième base SQLite. Il conserve l'identité de
l'opération avant exécution, attend effectivement environ 50 ms, puis mesure
la durée avec `process.hrtime.bigint()`. Il comptabilise le plafond entier du
temps écoulé en millisecondes et persiste un reçu final. Ce reçu concerne
`wallTimeMs`, pas du temps CPU ni une inférence facturée.

Le reçu lie allocation, opération, unité, portée, mission, conversation et
identité du fournisseur. Une régression refuse un reçu dont le hash est valide
mais qui décrit une autre opération de la même allocation.

## Source indisponible et préemption

Le fournisseur est arrêté après la persistance de son reçu, avant l'observation
de la consommation par le régulateur. La route IPC de lecture devient réellement
indisponible. `REPORT_USAGE` conserve `cumulativeAmount: null`, avec une source
indisponible et une issue non finale ; l'absence de réponse ne devient pas zéro.

Le régulateur préempte ensuite l'allocation. Les 8 000 unités exposées restent
retenues. Après son redémarrage, exposition et retenue sont encore présentes.
Le replay du rapport inconnu retourne son résultat historique sans libération.
Une nouvelle exposition sur l'allocation préemptée est refusée.

Après redémarrage du fournisseur, un nouveau `REPORT_USAGE` permet de lire son
reçu final sans relancer l'opération. La consommation mesurée devient durable,
puis `RELEASE` rend uniquement le solde non consommé et non exposé.
Le compteur du fournisseur reste à une seule opération exécutée.

Une nouvelle demande de 8 000 unités est refusée : le travail déjà effectué
n'a pas été remboursé. Une demande du reliquat exact peut être admise, en
préservant la réserve de 2 000 unités. Un second redémarrage conserve cet état.

## Comptabilité native et limites

La mesure temporelle est inscrite dans le vrai registre métabolique. Son
historique garde également l'observation initialement indisponible : son
agrégat historique peut rester incomplet, avec une `observedValue` connue,
alors que l'état courant de l'allocation est réconcilié. Aucune ancienne ligne
n'est effacée pour annoncer artificiellement un historique complet.

Les suites séparées appellent réellement les réservations modèle natives pour
les tokens et les micro-USD. Les conversions USD sont bornées et contrôlées ;
aucun euro n'est transformé en dollar et aucun octet en token. Un échantillon
natif déjà inscrit ne peut justifier deux incréments de consommation. Les
autres unités restent des quotas typés, sans prétendre fournir un contrôle OS
de mémoire ou de temps CPU.

Une charge externe dépassant son quota reste enregistrée comme dette : elle
bloque les nouvelles admissions plutôt que de disparaître pour satisfaire
l'invariant. Les reçus et unités ne constituent pas à eux seuls un limiteur
d'exécution chez un fournisseur tiers.

L'IPC et ses identités sont contrôlés par le superviseur du test. La campagne
ne qualifie pas une authentification réseau de production, un paiement, un
service de modèle distant ou une décision morphogénétique. Les callbacks
d'autorisation et de provenance sont des lectures de confiance ; une source
mutable indépendante doit participer au même verrou ou à une époque applicable.
Le profil ne prétend pas rendre atomiques plusieurs systèmes externes arbitraires.

Voir le [contrat](../03-reference/protocole-allostasie.md), la
[qualification](../03-reference/allostasie-qualification.md), les
[allocations](../03-reference/allostasie-allocations.md) et la
[consommation](../03-reference/allostasie-usage.md).
