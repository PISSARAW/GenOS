# ADR 0788 — Migration du catalogue Hachimoji sous preuves

**Statut** : Accepté

**Date** : 2026-11-04

**Domaine** : AgentDNA, catalogue, daemon résident, qualification

## Contexte

L'ADR 0784 fournit l'alphabet à huit lettres et la lecture compatible des anciens
génomes. Le catalogue livré reste cependant composé de 227 fichiers v1 ; sept
manifestes, dont celui du daemon résident, n'ont pas de binaire. Une recompilation
globale des anciens manifestes risquerait de changer les instructions depuis leur
compilation historique. Un changement d'encodage invalide aussi leurs empreintes.

## Décision

Ajouter `genome migrate-hachimoji` : transcoder les instructions UTF-8 en trois
bits par base, y compris chromosomes et gènes. Conserver les champs de régulation,
plasmides, cicatrices et sections inconnues. Comparer le phénotype recalculé avant
et après. Créer une nouvelle identité, rattacher le parent, conserver la lignée et
ajouter une mutation d'encodage portant l'ancienne empreinte. Le résultat reste
`DRAFT`, sans sélection héritée ni autorisation de promotion.

Refuser les génomes signés ou scellés nécessitant leur signataire, les brins dont
la conversion UTF-8 n'est pas réversible, et les anciens gènes à exons indexés en
nucléotides qui nécessiteraient une migration spécialisée. Les fichiers déjà
entièrement en trois bits restent identiques octet pour octet via le CLI.

La commande Node `backend/bin/migrate-agent-dna-hachimoji.cjs` sépare préparation,
qualification et application. Elle archive les entrées, lie chaque paire par ses
empreintes, vérifie les fichiers historiques dans une révision Git immuable et
exécute six programmes de preuve. Elle refuse les preuves absentes, périmées,
échouées et les changements concurrents. L'application est précédée d'une
vérification complète et restaure les fichiers déjà remplacés en cas d'échec.
Le mode `renew` renouvelle la qualification des mêmes binaires installés dans un
nouveau dossier de preuves, en réexécutant les six programmes et en conservant
l'empreinte du reçu précédent. L'empreinte des sources normalise les fins de ligne
du code ; les fichiers ADN et leurs empreintes physiques restent vérifiés octet
pour octet.

Le reçu versionné `shared/agentDnaHachimojiQualification.json` qualifie seulement
l'équivalence de représentation, la compilation des sept manifestes manquants,
la parité Rust/Node et le maintien des contrôles. Il ne vaut ni qualification de
mission, ni signature d'un propriétaire, ni preuve d'amélioration cognitive. Les
gates de confiance, de budget, de lease et de promotion existants restent requis.

Le daemon résident charge par défaut son nouveau fichier `.dna`, avec vérification
du reçu courant et de l'empreinte du fichier, puis expose sa liaison. Une référence
personnalisée de manifeste conserve son fonctionnement explicite. Une politique
d'environnement exigeant une signature refuse le binaire non signé.

## Conséquences

Les 234 entrées du catalogue ont un encodage Hachimoji. Les 227 binaires historiques
ne sont pas recompilés à partir de manifestes potentiellement modifiés. Leur
historique reste récupérable dans Git et dans l'archive locale de préparation.
Deux fixtures v1 dédiées maintiennent les tests de lecture et de signature
historiques sans laisser de fichiers v1 dans le répertoire auto-importé.

La base locale inspectée ne contient aucune ligne `agent_genomes` au début de
l'opération. Aucun génome de tenant ni état d'agent actif n'est réécrit. Les
installations déjà peuplées doivent migrer leurs propres copies avec leur
politique de confiance et leurs signataires ; le reçu du catalogue ne les autorise
pas à reprendre une qualification ou une promotion liée à une ancienne empreinte.

## Alternatives

- Recompiler tout : rejeté à cause de la dérive possible des instructions.
- Changer seulement l'en-tête : rejeté, car les deux bits seraient mal interprétés.
- Réutiliser signatures et qualifications de missions : rejeté, car les nouvelles
  empreintes ne sont plus les objets attestés.
- Ne migrer que `LocalCodeWorker` : rejeté, car les autres agents resteraient v1.

## Validation

Tests Rust de conservation, filiation, idempotence, refus de sources ambiguës,
signées ou scellées ; qualification des 234 fichiers par le CLI Rust réel et le
décodeur Node ; tests de filtrage des outils, paramètres du modèle, intégrité,
refus de preuve manquante ou périmée, politique stricte de signature et promotion
bloquée sans preuves. Les gates globaux du dépôt restent requis.
