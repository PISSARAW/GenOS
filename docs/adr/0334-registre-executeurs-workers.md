# ADR 0334 — Registre des exécuteurs natifs des workers

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Lié à** : ADR 0063, 0064, 0123, 0294

## Contexte

Le catalogue possède 19 kinds. Les exécuteurs natifs, la sélection du lancement
et les validateurs d'entrée étaient maintenus dans des listes distinctes. Des
dossiers génériques ne satisfaisaient pas les champs spécialisés des workers
d'exécution, de spécialité, de symbiose ou de récupération. Le dispatch enfant
ne transportait pas sa méthode persistée.

## Décision

`workerExecutorRegistry` devient la source commune de sélection, validation
d'entrée et exécution native. Chaque kind possède au moins une méthode
structurée. Les missions à modèle restent disponibles pour les kinds qui les
autorisaient. Les méthodes natives sont annoncées avec zéro jeton; une demande
de budget ne peut pas relever le plafond canonique du kind.

Les dossiers sont adaptés à leur kind et validés avant publication de la fin.
Les entrées doivent correspondre exactement au contrat persisté. Les refus du
guard d'exécution et les annulations ne deviennent pas des succès.

La restauration atomique exige un bail persistant d'action et de cible, une
empreinte SHA-256 du checkpoint et de l'état préalable, et un chemin réel dans
le workspace assigné. Elle refuse les liens et les états modifiés. La
coordination transporte les contrats de méthode à des enfants persistés,
supervisés et soumis aux limites de délégation existantes.

`check_arithmetic` fournit une dérivation calculée en entiers arbitraires pour
une proposition close sur les naturels (+, *, %, comparaisons). Il ne se
présente pas comme une preuve Lean. Les méthodes Lean conservent la vérification
externe et la version de toolchain explicite.

## Validation et limites

La matrice native exécute une méthode par kind et vérifie les artefacts, la
provenance et le refus d'entrées altérées. Son transport de supervision enfant
est simulé; les tests de dispatch sont distincts. Une telle matrice ne prouve
pas la robustesse de toutes les missions ni une parité complète Rust/Node.

Les reçus SHA-256 décrivent les calculs observés et les données fournies; ils
ne certifient pas l'authenticité des sources externes. Le transfert de liaison
préparé est livré dans le dossier parent, avec destinataire explicite et
accusé de réception encore en attente. Les considérations médicales sont
exclusivement synthétiques et pédagogiques.
