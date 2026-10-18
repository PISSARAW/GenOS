# ADR 0621 — Frontière de processus et reprise explicite des capsules

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : runtime, isolation, reprise, quarantaine, preuve
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0611, ADR 0618b, audit des concepts 01–07

## Contexte

Le bootstrap natif d'une capsule lançait le CLI avec une copie complète de
`process.env`. La copie de fichiers retirait déjà les secrets connus, mais un
processus pouvait encore recevoir des secrets ou des chemins de contrôle par
l'environnement. Le timeout arrêtait le processus direct sans demander
explicitement l'arrêt de son groupe sous Unix.

Après une interruption entre la création de la racine et son scellement, le
runtime refusait correctement de continuer. Il ne proposait toutefois aucune
reprise explicite qui conserve l'état partiel comme preuve. Un opérateur devait
donc choisir manuellement entre suppression et conservation, sans reçu commun.

Cette décision ferme une tranche applicative. Elle ne transforme pas une
validation de chemins en isolation noyau et ne prétend pas couper le réseau du
compte hôte.

## Décision

### Frontière du processus de bootstrap

Les commandes `agent create`, `snapshot create` et `capsule create` passent par
une frontière unique :

- le répertoire courant est la racine réelle et validée de la capsule ;
- l'environnement est reconstruit depuis la liste autorisée du runtime ;
- `HOME`, les secrets, les jetons, la base du contrôle plane et les URL de
  services GenOS ne sont pas transmis ;
- aucun shell n'est utilisé ;
- stdout et stderr restent bornés ;
- le timeout arrête l'arbre Windows ou le groupe détaché Unix.

### Reprise d'une capsule non scellée

La reprise n'est jamais implicite. `recoverPartial` acquiert le même verrou que
le provisionnement et applique les transitions suivantes :

| État observé | Décision |
|---|---|
| Racine partielle seule | déplacement atomique vers la quarantaine puis reçu |
| Quarantaine et reçu valide, sans nouvelle racine | même reçu, sans nouvel effet |
| Ancre SQLite d'un scellement antérieur | refus et escalade |
| Racine, quarantaine ou reçu en combinaison contradictoire | refus et escalade |
| Aucun état à récupérer | refus |

Le reçu `trinity.capsule-recovery/v1` lie la corrélation de mission, les chemins
avant/après et un digest d'inventaire borné à 10 000 entrées. Il porte
`promotionEligible: false` et `independentReviewRequired: true`. La preuve
partielle n'est ni supprimée ni transformée en succès.

## Conséquences

### Positives

- Une variable secrète ou un chemin de base ne traverse plus le bootstrap par
  héritage implicite.
- Une reprise après crash conserve l'état partiel et devient idempotente entre
  processus.
- Une capsule déjà ancrée ou un état contradictoire ne peut pas être « réparé »
  automatiquement en effaçant la preuve.
- Les erreurs de timeout et de bootstrap sont typées tout en conservant le
  message public historique utilisé par le fallback.

### Négatives et limites

- La quarantaine consomme de l'espace jusqu'à revue et nettoyage explicites.
- L'inventaire prouve quels chemins et tailles étaient présents après le
  déplacement ; il ne prouve pas la vérité de leur contenu.
- Le processus s'exécute toujours sous le compte OS de GenOS. Cette frontière
  ne fournit ni namespace, ni conteneur, ni blocage réseau noyau, ni quota CPU
  strict. Ces propriétés restent à qualifier par plateforme.
- Un crash entre déplacement et écriture du reçu est repris à partir du chemin
  de quarantaine déterministe ; toute autre combinaison reste fermée.

## Preuves exécutables

`backend/tests/test_trinity_l2_capsules.js` vérifie notamment :

- l'absence de secret, de `HOME` et de `GENOS_DB_PATH` dans le processus ;
- le `cwd` et les racines GenOS liés à la capsule ;
- la conservation du fichier partiel en quarantaine ;
- l'idempotence du reçu après reprise ;
- le reprovisionnement explicite après quarantaine ;
- le refus d'une seconde ambiguïté et d'une capsule possédant une ancre SQLite ;
- les refus historiques de symlink, d'altération et de concurrence.

## Alternatives écartées

- **Supprimer automatiquement la racine partielle** : perte de preuve et risque
  de masquer un effet externe déjà produit.
- **Réutiliser la racine partielle** : impossible de distinguer une écriture
  complète non scellée d'un état tronqué ou falsifié.
- **Conserver tout `process.env` avec une liste noire** : un nouveau secret ou
  endpoint traverserait la frontière par défaut.
- **Revendiquer une isolation OS complète** : contraire aux capacités réellement
  implémentées par cette phase.
