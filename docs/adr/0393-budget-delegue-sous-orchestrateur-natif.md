# ADR 0393 — Budget délégué du sous-orchestrateur natif

- **Statut** : accepté
- **Date** : 2026-10-10
- **Décideurs** : équipe GenOS
- **Domaine** : workers, délégation bornée, budget de tokens
- **Complète** : [ADR 0379](0379-octroi-borne-delegation-sous-orchestrateur.md)

## Contexte

La méthode native `coordinate_children` ne consomme aucun token de modèle
pour sa propre exécution. Son contrat fixe donc `resources.maxTokens` à zéro.
L'octroi de délégation réutilisait ce plafond pour financer les enfants et
refusait toute coordination native avec `SUBORCHESTRATOR_TOKEN_LIMIT`, même
quand le parent disposait d'une allocation de délégation positive.

## Décision

Un sous-orchestrateur **natif** porte deux plafonds distincts :
`resources.maxTokens = 0` pour son exécution et
`resources.maxDelegatedTokens` pour les tokens de modèle qu'il peut allouer
à ses enfants. Ce second plafond est borné par la politique du worker et par
l'allocation explicite ; une allocation explicite nulle refuse l'octroi.
`limits.maxTokens` reste le plafond de délégation vérifié lors de la création
et de la réservation des enfants. Le contrat canonique et la validation du
runtime vérifient les deux ressources indépendamment.

Les sous-orchestrateurs exécutés par modèle conservent la forme historique
du contrat : leur `resources.maxTokens` reste aussi la borne de délégation.
Le nouveau champ n'est ajouté qu'au contrat natif afin de garder valides les
contrats modèle déjà persistés.

## Conséquences

La coordination native peut exécuter ses enfants sous les contrôles existants
de nombre, profondeur, durée, portée et réservation de tokens. Son propre
budget d'exécution de modèle reste nul. Le champ supplémentaire fait partie
du contrat persisté et de sa validation canonique ; il n'autorise ni création
d'enfant sans délégation accordée ni dépassement du plafond de politique.

## Alternatives écartées

Attribuer des tokens de modèle au runtime natif masquerait sa consommation
réelle. Supprimer la garde positive dans `grantBoundedDelegation` permettrait
un octroi sans capacité pour les enfants. Modifier uniquement la fixture ne
changerait pas le plafond nul calculé pour toute méthode native.

## Vérification

`test_worker_native_matrix.js` vérifie les 19 méthodes natives et leurs
preuves typées. `test_worker_contract_enforcement.js` vérifie le plafond
runtime nul, la délégation positive, le refus explicite à zéro, le plafond
canonique et la compatibilité de la forme modèle. Les tests de limites
natives et de délégation bornée restent passants.
