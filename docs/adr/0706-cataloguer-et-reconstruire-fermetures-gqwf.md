# ADR 0706 — Cataloguer et reconstruire les fermetures d'exécution GQWF

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Domaine** : GQWF, CAS, reprise, provenance d'exécution
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0643, ADR 0701, ADR 0703

## Contexte

`gqwf-execution-closure-v1` donne une identité CAS à la racine, la commande,
au runtime, aux dépendances et à l'environnement déclarés d'une exécution. Son
index SQLite n'appartenait toutefois pas à `gqwf-catalog-v1`. La perte de la
ligne `gqwf_execution_closures` laissait l'objet lisible seulement si un reçu
extérieur en conservait le hash ; la réparation des métadonnées ne pouvait ni
retrouver la fermeture ni restaurer un objet de fermeture manquant.

Ajouter silencieusement ce champ au protocole v1 réinterpréterait des objets
déjà scellés. La compatibilité exige donc une nouvelle version de catalogue.

## Décision

Introduire `gqwf-catalog-v2`. Chaque nouveau checkpoint contient, en plus des
racines, têtes et baux de v1, une liste canonique `executionClosures`. Chaque
entrée contient :

- `closureHash`, identité SHA-256 de la fermeture ;
- `rootHash`, racine GQWF protégée ;
- `manifest`, contenu canonique `gqwf-execution-closure-v1`.

La construction du catalogue relit chaque manifeste SQLite avec le vérificateur
de fermeture, republie l'objet correspondant dans le CAS de métadonnées et
refuse toute différence d'identité. Les entrées sont triées par `closureHash`,
uniques, liées au même workspace et à une racine présente dans le catalogue.

`sealExecutionClosure` devient une mutation cataloguée. Un scellement réussi
produit donc un checkpoint v2 et sa ref append-only. La fenêtre « ligne SQLite
écrite, catalogue stageé, ref absente » reste couverte par
`gqwf-catalog-maintenance-v1`.

La réparation de métadonnées compare désormais la projection des fermetures.
Sous le plan stable et l'autorisation existants, elle restaure d'abord les
racines, puis :

1. réécrit le manifeste de fermeture s'il est absent du CAS et vérifie son hash ;
2. reconstruit `gqwf_execution_closures` ;
3. restaure têtes et baux selon les règles historiques.

Un catalogue v1 reste lisible, maintenable et réparable. Il signifie seulement
qu'aucune fermeture n'est couverte par ce catalogue historique. Toute nouvelle
révision est émise en v2 ; les objets v1 ne sont jamais modifiés.

## Invariants de sûreté

- une fermeture v2 doit référencer une racine incluse dans le même catalogue ;
- le manifeste embarqué doit recalculer exactement `closureHash` ;
- workspace, racine et protocole du manifeste doivent correspondre à l'entrée ;
- les champs supplémentaires, doublons et ordres non canoniques sont refusés ;
- la réparation ne s'exécute pas sans plan inchangé ni autorisation liée ;
- un objet CAS présent mais corrompu n'est jamais écrasé silencieusement ;
- une restauration de fermeture ne vaut ni attestation de sandbox, ni résultat
  de test, ni autorisation de promotion.

## Conséquences

### Positives

- La perte conjointe de l'index SQLite et d'un objet CAS absent devient
  réparable depuis le catalogue publié ; un objet présent mais corrompu reste
  en échec fermé pour quarantaine opérateur.
- Une fermeture nouvellement scellée entre automatiquement dans la chaîne de
  checkpoints et la maintenance post-crash.
- Le catalogue v2 conserve l'identité d'exécution à côté de l'identité des
  fichiers sans dépendre d'un reçu externe pour la redécouverte.
- Les catalogues v1 restent compatibles en lecture.

### Négatives et limites

- Le manifeste de fermeture est dupliqué dans son objet CAS et dans le catalogue
  v2 ; cette redondance est intentionnelle pour la reconstruction.
- La taille du catalogue croît avec le nombre de fermetures indexées.
- Les vues, overlays, sessions et décisions de rollout restent hors catalogue.
- Cette tranche améliore la durabilité de la provenance déclarée ; elle ne rend
  pas l'exécution hermétique et ne capture aucun accès externe.

## Alternatives

### Étendre `gqwf-catalog-v1` sans changer de protocole

Rejeté : un même identifiant désignerait deux formes canoniques incompatibles.

### Ne stocker que `closureHash`

Rejeté : un objet de fermeture perdu resterait impossible à reconstruire depuis
le catalogue, contrairement aux manifestes de racines déjà embarqués.

### Reconstruire toutes les fermetures trouvées dans le répertoire CAS

Rejeté : un scan ne fournit ni appartenance au workspace, ni ensemble attendu,
ni autorité pour réindexer les objets découverts.

### Promouvoir automatiquement une fermeture restaurée

Rejeté : la réussite d'un transport ou d'une réparation ne prouve pas la
validité d'une décision.

## Validation

`node backend/tests/test_gqwf_metadata_repair.js` couvre :

- l'émission d'un catalogue v2 contenant une fermeture ;
- la perte de l'index et de l'objet CAS de fermeture ;
- leur reconstruction sous plan et autorisation ;
- le refus d'écraser un objet CAS de fermeture présent mais corrompu ;
- l'inspection enregistrée après réparation ;
- la lecture et la maintenance d'un catalogue v1 historique.

`node backend/tests/test_gqwf_execution_closure.js` et
`node backend/tests/test_gqwf_catalog_maintenance.js` couvrent respectivement
les invariants propres à la fermeture et la chaîne de publication.
