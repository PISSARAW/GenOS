# ADR 0296 — Erreurs explicites de clivage embryogénétique

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Orchestrateur Rust, embryogenèse
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0295

## Contexte

`cleave_zygote` renvoie `Result<Vec<AgentCell>, String>` lorsqu'une mitose
échoue. L'orchestrateur traitait ce résultat comme un vecteur, ce qui empêchait
la compilation et aurait masqué le chemin d'échec si l'on avait remplacé
l'erreur par un essaim vide.

## Décision

`cleave_and_differentiate` renvoie lui aussi `Result<Vec<AgentCell>, String>`.
Il propage l'échec avant la différenciation et l'enregistrement du génome.
Les appelants doivent traiter explicitement l'erreur.

## Conséquences

- Une mitose échouée n'est pas présentée comme une différenciation réussie.
- La signature publique change ; les appelants Rust doivent gérer `Result`.
- La suite Rust doit encore être exécutée dans un environnement disposant de
  suffisamment d'espace de compilation.

## Cycle de spores et provenance

Les tests de l'orchestrateur ont aussi montré qu'une différenciation ne
renseignait pas le génome des cellules issues d'un zygote sans identifiant de
génome. Le clivage attribue donc le génome HOX aux cellules qui n'en possèdent
pas et préserve l'identifiant propre des autres. Une endospore bactérienne
issue d'une cellule active ranime cette même identité ; une spore reproductive
fongique peut créer une nouvelle identité. Dans les deux cas, la carte de
tissu est consommée avec l'identifiant du parent de la spore et le tissu
reçoit l'identifiant de la cellule effectivement germée. Cela évite les
références orphelines et permet de vérifier la continuité du génome.
