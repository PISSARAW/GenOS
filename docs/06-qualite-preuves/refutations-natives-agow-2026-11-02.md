# Réfutations natives mesurées par AGOW

- **Date** : 2026-11-02
- **Statut** : qualification locale exécutée sur D:
- **Socle committé** : `2f536dac5`
- **Décision** : [ADR 0769](../adr/0769-refutations-natives-mesurees-par-agow.md)
- **Portée** : postconditions `subset_sum`, budgets déclarés appariés, aucune promotion AGOW

## Question et protocole

Le contrat de mesure v2 doit distinguer un résultat correct, un résultat faux
réfuté par deux oracles, une panne technique et un oracle inconclusif. Ces cas
passent par la vraie délégation native, les autorités, les reçus biologiques et
les gates existants. La faute est injectée uniquement dans la sortie calculée
du worker, avant son enregistrement ; les réponses d'oracle ne sont pas modifiées.

Les deux bras comparés utilisent `[3, 5, 7]` avec cible 10 et exactement les mêmes
plafonds scellés. Le second incrémente de 1 la somme annoncée par le worker. Les
stratégies indépendantes `subset_bitset` et `subset_enumeration` s'exécutent chacune
dans un processus distinct. Le lecteur de réfutation recoupe les signatures,
le claim, le sujet, l'autorité, les observations, l'allocation et les événements
d'exécution scellés. Le lecteur de preuve positive reste inchangé.

Deux contrôles supplémentaires testent les inconnus : une exception du worker
avant toute preuve, et une entrée de 21 valeurs égales à 1, cible 10, qui dépasse
le domaine de l'oracle d'énumération. Cette dernière n'est pas appariée à l'entrée
à trois valeurs pour comparer une politique.

Le manifeste fixe méthode par condition, métrique et 19 sources importantes avant
exécution. Le runner vérifie de nouveau leurs hashes avant de produire le rapport.

## Résultat final

| Condition | Statut du run | Observation AGOW | Perte | Processus d'oracle | Temps cumulé des oracles |
| --- | --- | --- | ---: | ---: | ---: |
| Résultat correct | `completed` | `verified` | 0 | 2 | 368 ms |
| Résultat réfuté | `blocked` | `verified` | 1 | 2 | 627 ms |
| Panne technique | `failed` | `verification_pending` | inconnue | non mesuré | non mesuré |
| Oracle inconclusif | `blocked` | `verification_pending` | inconnue | 2 | 522 ms |

Une attestation `accepted: false` ne suffit pas : elle apparaît dans les cas
réfuté et inconclusif, mais seule la double réfutation signée autorise une perte 1.
L'observation négative vérifiée n'est jamais une preuve de réussite : le run reste
bloqué, le reçu biologique reste non vérifié et aucune acceptation native n'existe.
Le lecteur positif rejette encore cette assemblée.

## Couverture et interprétation

- Population du banc : 4 cas, dont 2 mesurés et 2 inconnus.
- Couverture : **50 %**.
- Moyenne des seules pertes connues : **0,5**.
- Bornes de la moyenne sur les quatre cas, sans imputer les inconnus : **[0,25 ; 0,75]**.

Ces bornes sont arithmétiques pour une perte binaire, pas des intervalles de
confiance. Les plafonds déclarés sont appariés ; les temps consommés diffèrent et
ne constituent pas une comparaison de vitesse. Ce banc de fautes contrôlées ne
mesure pas un gain causal d'AGOW et ne compare pas des politiques apprenantes.

## Contre-tests

Les tests refusent un événement substitué, une signature altérée, un seul reçu,
deux copies du même vérificateur et l'utilisation du contrat v1 pour mesurer une
réfutation. Ils appellent également le lecteur positif existant et vérifient son
refus `ORACLE_ASSEMBLY_NOT_ACCEPTED`. La mesure négative ne crée aucune acceptation.

Les données et temporaires sont sur D: à la demande de l'utilisateur. Le
démonstrateur initial accepte aussi une racine configurable ; son vérificateur
résout les chemins réels et refuse de traiter la racine elle-même comme archive.
Aucun contrôle de réserve disque ou de confinement n'est désactivé.

## Commandes et validation

```powershell
$env:GENOS_AGOW_QUALIFICATION_ROOT = 'D:/GenOS-AGOW/qualifications'
$env:GENOS_AGOW_DEMO_ROOT = 'D:/GenOS-AGOW/demos'
$env:TEMP = 'D:/GenOS-AGOW/temp'
$env:TMP = $env:TEMP
npm --prefix backend run test:agow
```

Ce passage termine avec code 0 : 15 tests du journal, qualification native positive,
qualification v2 à quatre cas et suite AGOW historique. Le contrôle qualité global
termine avec code 0 (8 362 sources, aucune violation nouvelle). L'index ADR régénéré
compte 903 fichiers et 903 entrées, sans problème au moment de sa vérification.

La première tentative de `npm test` était refusée avant exécution : le dépôt
source sur C: ne disposait que de 125 MiB pour les 512 MiB requis. Le déblocage
a utilisé une copie de validation figée sur D:, avec son propre verrou Git,
sans modifier les réserves disque. Son premier passage a révélé une empreinte
GCI périmée après modification de la politique de promotion. Le descripteur a
été recalculé ; ses contrôles d'intégrité et d'approbation sont conservés.

La relance complète dans `D:/GenOS-AGOW/v-1cd6e5d0/GenOS` termine avec code 0
pour `npm test` et `cargo test --workspace`. Les cinq tests GCI passent également.
Le contrôle qualité de cette copie vérifie 8 380 sources, sans violation.
Les 11 073 fichiers capturés ont été recoupés sans dérive, avec la seule
correction d'empreinte ajoutée à l'état initial. Ces résultats portent sur cette
copie figée ; les changements concurrents ultérieurs du dépôt source sont hors
de cette validation globale.

Les résultats, commandes, hashes des logs et périmètres sont conservés dans
`D:/GenOS-AGOW/v-1cd6e5d0/validation-status.json`. L'empreinte finale de la copie
est `046b79274723e7885fb39ece556df7b31cac64a5adc0ac81e73e5873cd49ad28`.
Le rapport présent a ensuite été actualisé pour documenter ce déblocage.

## Artefacts et provenance

Répertoire final :
`D:/GenOS-AGOW/qualifications/71218408-a36b-4f1b-9844-7b0137f190d7/`.

- `manifest.json` : protocole, méthodes par condition et sources importantes.
- `report.json` : runs, reçus, attestations, métriques et couverture.
- `mission.sqlite` : états et preuves durables.
- Hash du manifeste :
  `sha256:f293d0f20402cd6b8594f0de51611bbfc2cbf475efc31e2ad942a4b30f47307b`.
- Hash du rapport :
  `sha256:d7aec3ec415dc8e9f8eb30375a4e2f95865971844623da580a8c85d25c0c13a1`.
- Logs : `D:/GenOS-AGOW/validation/agow-v2-suite.log`, `quality-v2.log`,
  `npm-v2.log` et `cargo-v2.log`.

Le raccord v2 et la correction GCI constituent le périmètre de livraison décrit
ici. Les hashes des sources du manifeste final ont été recoupés après exécution
sans dérive observée.
Le manifeste couvre des sources critiques, sans prétendre archiver toutes les
dépendances transitives ni constituer une réplication externe.

## Limites et suite

Les entrées sont artificielles et connues, les fautes contrôlées, le worker natif
exécuté dans le processus hôte. Aucun LLM, changement de topologie, apprentissage
ou déploiement n'est qualifié. Une campagne d'efficacité devra ajouter de nouvelles
tâches cachées, des politiques comparées sous état initial contrôlé et des
réplications indépendantes, en conservant les inconnus et les coûts observés.
