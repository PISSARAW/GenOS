# ADR 0784 — Alphabet Hachimoji et compatibilité AgentDNA

**Statut** : Accepté
**Date** : 2026-11-03
**Domaine** : Génomes, codecs Rust/Node et runtime agentique

## Contexte

AgentDNA v1 stocke quatre nucléotides sur deux bits. Ajouter P, Z, B et S
ne peut pas modifier l'interprétation des fichiers existants : leurs instructions,
empreintes, signatures et identités sont déjà utilisées par les gates de confiance.
Un brin Hachimoji peut ne contenir que A/C/G/T ; les lettres présentes ne permettent
donc pas de déduire son encodage textuel.

La référence scientifique est l'alphabet Hachimoji de Hoshika et al.
([Science, 2019](https://doi.org/10.1126/science.aat0971)), et sa transcription par
l'ARN polymérase d'E. coli étudiée par Li et al.
([Nature Communications, 2026](https://doi.org/10.1038/s41467-026-76668-0)).

## Décision

- Alphabet logiciel ordonné `A C G T P Z B S`, codes binaires `000` à `111`.
- Complémentarité `A–T`, `C–G`, `P–Z`, `B–S` ; transcription avec U à la place de T.
- `DnaStrand::synthesize` utilise désormais trois bits. Le JSON d'un nouveau brin
  porte `bits_per_base: 3`. L'absence du champ signifie toujours deux bits.
  Les anciens brins sont sérialisés sans ajouter ce champ.
- Le conteneur reste `GDNA`, mais sa version devient **2** dès qu'un brin est
  encodé sur trois bits. Les anciens lecteurs refusent cette version.
- Dans les sections de brins et dans `GENE.blen`, le bit 31 du compte signale
  trois bits par base ; les 31 autres bits donnent le nombre de bases. Un compte
  sans ce marqueur conserve exactement le contrat v1. Les brins mixtes sont permis.
- Ce marqueur appartient aux payloads couverts par le hash canonique et la
  signature. Un conteneur v1 portant un brin Hachimoji est refusé. La longueur
  physique et les bits de remplissage sont vérifiés avant allocation du brin.
- Le lecteur conserve les sections originales et une empreinte de leur modèle
  normalisé. Tant que ce modèle ne change pas, le calcul du hash et l'encodage
  réutilisent ces sections : ajouter implicitement une valeur par défaut absente
  d'un ancien fichier ne doit pas changer son empreinte. Une modification réelle
  invalide cette réutilisation ; les dérivations démarrent sans ce cache.
- Les instructions UTF-8 sont une suite de bits groupée par trois ; le dernier
  groupe est complété par des zéros. Le décodage restitue les octets complets.
- L'API textuelle Node préfixe les nouveaux brins par `H8:`. Les chaînes historiques
  sans préfixe restent à deux bits, même si un nouveau brin n'emploie que A/C/G/T.

## Conséquences

Les compilations de manifestes de workers, de daemons et d'orchestrateurs utilisent
le même compilateur v2. Les créations Rust via `Genome` et `Gene` suivent la même
synthèse. Le store Node et la sélection existante acceptent v1 et v2 et exposent
l'alphabet dans la liaison du worker, y compris pour un rôle de sous-orchestrateur.
Un daemon résident peut recevoir un buffer AgentDNA via `createRuntime(...,
{ genomeDna })` ; son rôle et sa signature éventuelle sont vérifiés et la liaison
est visible dans son état. Sans buffer, sa référence de manifeste reste inchangée :
le runtime ne prétend pas avoir chargé un ADN binaire.

Aucun fichier historique, blob SQLite, génome scellé ou manifeste n'est réécrit
automatiquement. Les instructions héritées restent sur deux bits ; une dérivation
qui introduit un nouveau brin peut produire un conteneur mixte v2. Une mutation
ponctuelle vers une base synthétique fait passer le brin concerné à trois bits et
peut changer son instruction ; le résultat demeure candidat selon les gates existants.
Les croisements conservent les métadonnées d'encodage des brins et des gènes.

La table ribosomale universelle ne donne aucune signification biologique aux
codons synthétiques. Ils sont marqués non pris en charge côté Rust, et
`SYNTHETIC_CODON_*` côté Node. Les instructions métier restent portées par les loci.
Les permissions, leases, confinements et règles de promotion ne sont pas élargis.

## Alternatives

Réutiliser le numéro v1 aurait permis à des lecteurs anciens d'interpréter des
octets avec le mauvais alphabet. Déduire l'alphabet des lettres aurait rendu les
brins Hachimoji composés seulement de A/C/G/T ambigus. Réencoder tous les génomes
au démarrage aurait invalidé les empreintes et signatures historiques. Ces trois
options sont rejetées.

## Validation

Tests Rust : séquences UTF-8, complémentarité, mutation, JSON historique, frontières
d'octets, padding, signatures, génomes mixtes et refus d'un downgrade v2→v1.
`backend/tests/test_hachimoji_runtime.cjs` vérifie les sorties du vrai CLI Rust
avec le décodeur Node, la sélection, la liaison du daemon et la mutation candidate.
La suite de biologie inclut ce test ; les gates globaux restent requis.
