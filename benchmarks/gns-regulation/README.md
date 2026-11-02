# Comparaison du régulateur GNS

Depuis la racine : `node benchmarks/gns-regulation/run.cjs`.

Le banc exécute deux charges de fixture (`steady`, `burst`) avec le même seed,
les mêmes douze travaux, huit tours, capacité de cinq workers et les mêmes
budgets configurés dans les bras GNS inactif/actif. Les compteurs, politiques
signées et réservations passent par SQLite et les modules de production.

Le travail est synthétique : trois quanta de service par tour, réduits à deux
au-dessus de trois workers simultanés. L'oracle indépendant vérifie le hash du
contenu de fixture. Aucun worker externe ou fournisseur de modèle n'est lancé.
Les demandes de ce pilote arrivent directement au point de réservation ; elles
ne simulent pas une file durable pour autoriser artificiellement la prévision.
Le mode prédictif d'action reste désactivé par défaut comme en production.

La sortie JSON publie les résultats des deux bras, y compris les régressions,
les travaux restant inachevés et le coût réel du capteur. Une égalité ou un gain
sur ce modèle ne prouve pas un bénéfice en production. Les tests séparés couvrent
les files natives, l'action prédictive autorisée et la reprise après crash.
