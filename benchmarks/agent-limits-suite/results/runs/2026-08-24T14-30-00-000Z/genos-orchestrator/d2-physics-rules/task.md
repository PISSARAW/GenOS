# Tâche : physique intuitive en règles formelles

Appliquez **uniquement** les règles ci-dessous. N'ajoutez aucun savoir
extérieur, même évident.

- **R1 Gravité** : tout objet non soutenu tombe.
- **R2 Renversement** : un contenant OUVERT incliné à plus de 45° de la
  verticale répand son contenu liquide.
- **R3 Pente** : une bille sur un plan incliné à plus de 10° roule vers le bas.
- **R4 Fragilité** : un objet fragile heurtant une surface DURE à plus de
  2 m/s se casse ; sinon il survit.
- **R5 Inertie** : sans frottement ni obstacle, un objet en mouvement ne
  s'arrête jamais seul.
- **R6 Exclusion** : deux objets solides ne peuvent occuper le même emplacement.

## Scénarios (choisissez l'issue)

| # | Scénario |
| --- | --- |
| s1 | Verre ouvert rempli d'eau incliné à 60°. |
| s2 | Bille sur plan incliné à 5°, rien d'autre n'agit. |
| s3 | Tasse FERMÉE hermétiquement inclinée à 70°. |
| s4 | Vase fragile tombe et touche du carrelage dur à 3 m/s. |
| s5 | Même vase tombe et touche un tapis épais (surface non dure) à 1 m/s. |
| s6 | Palet glisse sur glace parfaitement lisse, aucun obstacle devant. |
| s7 | Deux cubes poussés en même temps vers la seule case libre restante. |
| s8 | Livre posé à plat sur une table stable. |
| s9 | Bille sur plan incliné à 25°. |
| s10 | Bouteille ouverte inclinée à 30°. |

Issues possibles : `se_repand`, `pas_de_repansement`, `contenu_conserve`,
`reste_en_place`, `roule`, `se_casse`, `survit`,
`continue_indefiniment`, `blocage_exclusion`, `ne_bouge_pas`.

## Réponse

`answers/physics.json` :

```json
{ "s1": "?", "s2": "?", "s3": "?", "s4": "?", "s5": "?", "s6": "?", "s7": "?", "s8": "?", "s9": "?", "s10": "?" }
```
