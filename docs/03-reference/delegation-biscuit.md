# Délégation Biscuit des sous-orchestrateurs

Le pilote du lot 6 protège le dispatch persistant des sous-orchestrateurs.
Il utilise le module officiel Biscuit 0.5.0 du backend. Le contrat enregistré
reste obligatoire ; le jeton ne donne aucun droit supplémentaire.

## Activer la vérification

Définir GENOS_BISCUIT_DELEGATION_PUBLIC_KEY avec la clé publique hexadécimale
du signataire de confiance, puis redémarrer le backend. Avec cette variable
définie, chaque appel genos_delegate_worker doit porter un argument
delegationToken. Un jeton absent, invalide, expiré, révoqué ou hors portée
bloque la création du worker.

La clé privée est conservée par l'émetteur, hors du backend. Le service
backend/src/services/agents/biscuitDelegationService.js expose
issueDelegation pour émettre un jeton, attenuateDelegation pour restreindre
un type d'enfant, et verifyDelegation pour vérifier une demande.

L'émetteur fournit l'identifiant exact du sous-orchestrateur persistant, les
types d'enfants autorisés et l'expiration en millisecondes Unix. Le destinataire
fournit le jeton dans delegationToken. Les identifiants de révocation de blocs
peuvent être ajoutés dans workerContract.revokedCapabilityIds du contrat
persistant. Ce champ doit être mis à jour par un opérateur autorisé.

## Limites

La configuration de la clé publique est facultative pour la compatibilité
avec le dispatch local existant. Sans elle, aucun contrôle Biscuit n'est
exécuté. La révocation est un contrôle en ligne du contrat persistant, tandis
que l'atténuation peut être faite hors ligne. Les budgets et le nombre total
d'enfants restent contrôlés dans le backend. Une réussite d'autorisation ne
constitue pas une preuve de réussite de la mission.

Exécuter le test ciblé :

    node backend/tests/test_biscuit_delegation.js

Voir [ADR 0323](../adr/0323-biscuit-delegation-workers.md).