# ADR 0029 — Résultat formel canonique en MessagePack

- **Statut** : Accepté
- **Date** : 2026-09-19
- **Domaine** : Résultats, preuve, provenance, sérialisation
- **Lié à** : [ADR 0001](0001-agent-dna-binary-format.md), [ADR 0022](0022-resultats-operationnels-et-preuve.md), [ADR 0024](0024-contexte-epistemique-scientifique.md)

## Contexte

Un résultat de recherche ne peut pas être réduit à une valeur libre ou à un succès
de transport. Il doit préserver son énoncé, ses hypothèses, son domaine de validité,
ses dépendances, son niveau épistémique, sa preuve et sa provenance. JSON est utile
aux frontières humaines, mais il est verbeux et ne fournit pas à lui seul une forme
canonique binaire pour le calcul d'identité.

## Décision

Le contrat `genos.formal-result/v1` représente un résultat par un objet validé puis
par un tableau positionnel MessagePack précédé de la signature ASCII `GFR1`.

Le contrat exige :

- un énoncé canonique et une empreinte SHA-256 de son contenu sémantique ;
- la liste exacte des hypothèses et un domaine de validité contraint ;
- des dépendances portant l'identifiant et l'empreinte sémantique de chaque lemme ;
- un statut parmi `conjecture`, `tested`, `refuted`, `formalized`, `verified` ;
- une preuve, un contre-exemple ou un artefact avec protocole de reproduction ;
- la provenance (date, acteur, source, entrées et transformations) ;
- le modèle producteur et sa version.

L'empreinte sémantique couvre l'énoncé, les hypothèses et le domaine de validité.
L'identifiant du résultat couvre aussi les dépendances, le statut, la preuve, la
provenance et le producteur. Le décodeur recalcule ces empreintes et refuse toute
divergence.

## Conséquences

### Positives

- Une même proposition conserve une identité sémantique à travers plusieurs essais.
- Deux preuves ou producteurs distincts restent des résultats intégraux distincts.
- La forme positionnelle est compacte et déterministe ; le test compare sa taille à
  la représentation JSON de la même fixture sans généraliser ce gain à toute charge.
- Un résultat incomplet ou un statut inconnu est rejeté avant sérialisation.

### Négatives

- Le binaire n'est pas directement lisible par un humain.
- L'ordre positionnel est un ABI : toute évolution incompatible exige une nouvelle
  version de trame.
- La présence d'une preuve typée ne démontre pas sa validité ; les gates de promotion
  et la reproduction indépendante restent nécessaires.

## Alternatives

- **JSON canonique** : portable mais plus verbeux et déjà utilisé comme format
  historique, sans bénéfice binaire.
- **Protobuf** : schéma fort, mais introduit ici du code généré alors que MessagePack
  est déjà la représentation binaire adoptée par le dépôt.
- **CBOR** : propriétés comparables, mais sans avantage local face à `msgpackr`, déjà
  dépendance du backend.
