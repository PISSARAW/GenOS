# ADR 0400 — Publier une racine GQWF depuis une promotion Trinity vérifiée

- **Statut** : Accepté, activation explicite.
- **Date** : 2026-10-11.
- **Domaine** : Trinity, GQWF, promotion.
- **Lié à** : [ADR 0369](0369-racines-gqwf-et-vues-durables.md), [ADR 0399](0399-liaison-recu-promotion-gqwf.md).

## Contexte

Trinity exécute des contrôles d'intégration configurés, vérifie les claims,
contrôle que la candidate physique n'a pas changé et signe une référence
AgentGit avant de déclarer une promotion. GQWF conservait les vues des workers
mais ne possédait aucune tête publiée par ce parcours.

## Décision

Pour une mission avec `executionPolicy.gqwfV2: true`, le runtime importe les
projections de la source et de la candidate Trinity dans le magasin du
workspace source. La racine candidate et l'identité du workspace sont placées
dans les métadonnées de l'objet AgentGit signé. Le runtime relit cet objet,
vérifie sa signature et ses liens vers l'expérience, la candidate physique,
le hash de contenu et la racine GQWF. Il exige au moins un contrôle
d'intégration réussi et la couverture des claims.

La tête `trinity/<id de l'expérience>` part de la racine source et avance
vers la candidate via `publishCandidate`. Cette transition et la décision
Trinity partagent une transaction SQLite. Les blobs écrits avant la
transaction peuvent rester orphelins si la promotion échoue ; aucune
collecte automatique n'est autorisée sans inventaire de rétention.
Une relecture de la promotion contrôle aussi la tête, sa génération et
l'événement lié à l'objet AgentGit signé ; une altération fait perdre le
statut promu dans la réponse de rejeu.

La projection GQWF exclut Git, les dépendances et l'environnement physique.
Le commit AgentGit et les contrôles Trinity gardent leur rôle de preuve ; la
racine GQWF ne les remplace pas. Les parcours sans `gqwfV2` restent identiques.

## Vérification

`backend/tests/test_gqwf_trinity_promotion.js` couvre la signature, les
liaisons de métadonnées, les contrôles incomplets, une candidate modifiée,
l'événement de tête et le refus d'un rejeu après altération.
La qualification de mission Trinity complète, avec processus et tests réels,
reste requise avant activation par défaut.
