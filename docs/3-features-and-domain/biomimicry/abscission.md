# Abscission — Élagage Stratégique

> **Concept** : Les arbres larguent volontairement leurs feuilles en hiver (abscission) pour conserver l'énergie de la sève, après en avoir aspiré les nutriments restants.
> **Statut** : implémenté (genos-core::biomimicry::abscission)

## Bénéfice
Lorsqu'un sous-agent ou une branche d'exploration s'enlise (hallucinations ou loops infinis sur un outil), le système central déclenche l'outil iomimicry_plant_abscission. Plutôt que de simplement "tuer" l'agent (Apoptose), l'Abscission permet de *siphonner* le budget (tokens alloués) qui restait à cet agent et de le ré-absorber dans le pool central avant de couper la branche définitivement.
