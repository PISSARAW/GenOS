# ADR 0766 — Composition de l'inventaire et preuves bornées

Date : 2026-11-03. Statut : accepté.

## Décision

Publier une identité versionnée par espace de noms dans le catalogue canonique.
Un alias résolu partage la clé de sa cible ; une version ou un espace de noms
incompatible bloque la résolution. La disponibilité historique reste distincte
des cinq niveaux déclaré, implémenté, raccordé, activé et qualifié. Les trois
derniers restent inconnus dans le catalogue, qui ne possède aucune preuve de
mission. Une implémentation non démontrée reste inconnue plutôt que fausse.

Les demandes de réparation A-Team sont transmises au contrôleur GQEL natif.
Il valide les critères contre le contrat courant, borne les tentatives et
conserve un checkpoint du plan avant génération. Aucun critère externe ne peut
affaiblir le contrat. Les budgets, vérifications et reçus GQEL existants restent
obligatoires ; une réparation n'autorise pas une promotion de mission.

## Alternatives et limites

Un booléen global « opérationnel » masque les dépendances et le périmètre des
preuves. Déduire une qualification depuis le nom d'un service serait incorrect.
Les tests du contrôleur emploient des réponses déterministes ; ils ne démontrent
aucun gain général de modèle. Les contrats AEIS de réparation scellée conservent
leur validation propre et ne sont pas convertis en critères GQEL implicites.
