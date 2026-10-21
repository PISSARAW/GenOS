# ADR 0717 — Parité du worker mathématique et preuve formelle

- **Statut :** Accepté
- **Date :** 2026-10-22
- **Domaine :** workers, exécution native, contrats MCP, preuve
- **Décideurs :** équipe GenOS
- **Lié à :** ADR 0043, ADR 0334

## Contexte

Le type Node `math_worker` et sa méthode native `compute_integral` ont été ajoutés sans
mise à jour simultanée du registre Rust, des schémas MCP, de l'ontologie et des campagnes
de qualification. Cette divergence permettait au contrôle Node d'accepter un type que les
autres projections du runtime ne connaissaient pas. Son rapport annonçait en outre un
`formal_certificate` sans la structure de reçu exigée par la barrière d'artefacts.

## Décision

`math_worker` devient le vingtième `WorkerKind` canonique : famille `Epistemic`, cognition
déterministe, budget de tokens modèle nul et artefact `formal_certificate`. Les registres
Rust et Node, les inventaires ontologiques, les schémas MCP et les fixtures de qualification
doivent contenir le même identifiant.

Un résultat mathématique natif n'est recevable que si son certificat lie exactement le
claim, le solveur, le résultat et un reçu `solver://sha256:...`. Le simple succès du
processus ne suffit pas. La limite d'objectifs natifs passe de 19 à 20 pour permettre une
matrice contenant une instance de chaque type canonique.

## Conséquences

### Positives

- la parité Rust/Node est vérifiée automatiquement pour les 20 types ;
- le worker mathématique participe aux inventaires et campagnes au lieu de rester hors
  catalogue ;
- un certificat mathématique incomplet est refusé par la barrière d'artefacts ;
- les clients MCP peuvent déclarer une mission native couvrant les 20 types.

### Négatives

- les consommateurs qui supposaient une cardinalité fixe de 19 doivent être mis à jour ;
- chaque nouvelle méthode mathématique exige toujours un oracle et une fixture propres ;
- ce worker ne transforme pas une réponse LLM en preuve et ne généralise pas au-delà de
  ses contrats de méthode enregistrés.

## Alternatives

- **Conserver `math_worker` uniquement côté Node :** rejeté, car la divergence de registre
  rend les contrats et les audits contradictoires.
- **Réutiliser `formal_worker` :** rejeté, car le solveur mathématique natif n'a pas le même
  outil ni le même contrat que Lean.
- **Accepter un dossier générique :** rejeté, car cela contournerait la validation du
  certificat formel.
