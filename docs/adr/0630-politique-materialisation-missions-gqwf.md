# ADR 0630 — Politique de matérialisation des missions GQWF

- **Statut** : Accepté, activation explicite
- **Date** : 2026-10-18
- **Domaine** : GQWF, missions, workspaces, Copy-on-Write
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0605b, ADR 0618a, ADR 0628, ADR 0629

## Contexte

Le SPI GQWF et le backend reflink savent sélectionner puis attester un mécanisme
de matérialisation. La mission supervisée utilisait cependant toujours le
backend portable, car aucune politique ne traversait l'ingress, la
normalisation et la création du fabric. Le reflink restait donc qualifiable par
l'API directe mais inaccessible au chemin d'exécution réel.

Une sélection globale par variable d'environnement rendrait les missions moins
reproductibles. Déduire le backend effectif de la valeur demandée serait faux
pour `auto`, qui peut choisir un reflink ou une copie portable selon le volume.

## Décision

Une mission peut déclarer `executionPolicy.gqwfMaterializer` avec exactement
une des valeurs suivantes : `portable-copy-v1`, `native-reflink-v1` ou `auto`.
L'ingress accepte aussi `gqwf_materializer`, mais le modèle interne conserve la
forme canonique. La politique est propagée au fan-out des workers.

La valeur est validée après le routage canari et avant tout provisionnement
physique. Elle est refusée si elle est inconnue ou si la mission n'active ni
GQWF v2 ni une affectation canari. Une mission sans ce champ conserve le défaut
`portable-copy-v1`.

La création du fabric reçoit la politique validée. Une demande explicite de
`native-reflink-v1` échoue si la capacité du volume manque, sans créer de bail.
Le mode `auto` autorise le repli portable déjà défini par le SPI. Le descripteur
de mission relit le reçu lié au bail et expose le backend, la raison de
sélection et les hashes de capacité et de reçu. Ces informations restent
consultables après ingestion et libération.

## Conséquences

### Positives

- Le backend reflink devient utilisable par une mission réelle sans état global.
- Chaque choix automatique est observable et lié à une preuve durable.
- Le défaut portable préserve la compatibilité des missions existantes.
- Les politiques invalides échouent avant une copie physique.
- Le bras contrôle d'un canari reste physique sans perdre la demande déclarée.

### Négatives

- Le schéma de politique publique gagne un champ à maintenir aux frontières.
- La réussite de `auto` ne garantit pas un reflink ; le reçu doit être consulté.
- La sélection reste limitée aux backends enregistrés dans le processus.

## Alternatives

- Activer `auto` par défaut : rejeté, car cela modifierait silencieusement les
  performances et la provenance des missions existantes.
- Utiliser une variable d'environnement globale : rejeté, car deux missions du
  même processus ne pourraient pas exprimer des politiques distinctes.
- Enregistrer uniquement la demande : rejeté, car elle ne prouve pas le backend
  réellement sélectionné.
- Rejouer automatiquement en copie portable après un échec reflink explicite :
  rejeté, car cela contredirait la sémantique stricte de la demande.
