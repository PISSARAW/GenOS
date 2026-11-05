# Identités des runs et cellules de comparaison Trinity

- Statut : accepté
- Date : 2026-11-05

Les workers autonomes Trinity étaient scellés sous la mission racine alors
que leurs preuves et leur clôture appartiennent à une mission de comparaison
distincte. Cela empêchait la qualification des identités SYNAPSE et rendait
le graphe de vérité de la comparaison indisponible.

L’expérience, les runs et leurs cellules appartiennent désormais à la mission
de comparaison. Son épisode est créé depuis le tenant réel du parent. Le
dispatch ne crée plus préalablement des cellules inutilisées dans l’épisode
racine. Les appartenances à la racine restent conservées pour la filiation.

Le budget et le contexte SYNAPSE proviennent du run racine uniquement si le
contrôle existant de filiation Trinity valide l’expérience, les worlds, les
appartenances et l’orchestrateur. Une autre mission ou un autre parent reste
refusé. Le graphe de vérité utilise la mission de comparaison ; il ne
réétiquette pas les reçus enfants comme preuves de la racine.

La qualification exécutable `test_gqwf_trinity_mission_qualification.js`
vérifie les trois workers réels, leur mission enfant, la filiation native
SYNAPSE, les reçus indépendants, la compilation des preuves et la reprise.
