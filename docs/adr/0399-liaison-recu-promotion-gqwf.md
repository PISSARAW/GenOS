# ADR 0399 — Lier le reçu de promotion GQWF à la tête et aux octets

- **Statut** : Accepté pour la frontière de publication du noyau backend.
- **Date** : 2026-10-11.
- **Domaine** : GQWF, preuves, promotion.
- **Lié à** : [ADR 0369](0369-racines-gqwf-et-vues-durables.md).

## Contexte

`publishCandidate` refusait déjà une publication sans vérificateur injecté.
Son verdict ne liait toutefois que la racine candidate et un identifiant de
preuve. Il pouvait donc être réutilisé par erreur pour une autre tête, un
autre workspace ou une génération différente. La lecture du manifeste ne
relisait pas les octets des blobs avant le déplacement de la tête.

## Décision

Le verdict du vérificateur doit confirmer le workspace, le nom de la tête,
la racine précédente, sa génération attendue et la racine candidate. Un
identifiant de preuve non vide est obligatoire. GQWF relit chaque blob avec
contrôle SHA-256 et taille avant d'appeler le vérificateur, puis juste avant
la mise à jour transactionnelle de la tête. Le CAS de génération et de racine
reste obligatoire.

Le vérificateur demeure une dépendance de confiance du runtime. Ce contrat ne
transforme pas un booléen fourni par un caller en preuve et n'autorise aucune
publication si le runtime ne fournit pas de vérificateur. La production et
la persistance d'un reçu indépendant lié à une exécution réelle sont une
tranche distincte, préalable à l'activation générale.

## Vérification

`backend/tests/test_gqwf_fabric.js` exerce les refus de verdict mal lié,
de blob corrompu, d'absence de vérificateur et de tête devenue obsolète.
La qualification de bout en bout devra en outre prouver la provenance du
reçu et le lien entre candidat, tests exécutés et décision de promotion.
