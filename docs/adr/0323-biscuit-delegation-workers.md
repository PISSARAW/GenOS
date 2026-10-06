# ADR 0323 - Jetons Biscuit pour la délégation bornée

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : autorisation, sous-orchestration, délégation
- **Décideurs** : équipe GenOS
- **Lié à** : [Autorisation Cedar](0311-autorisation-cedar-agents.md)

## Contexte

Le contrat persistant du sous-orchestrateur fixe déjà sa durée, sa profondeur et
son nombre maximal d'enfants. Pour transmettre une autorité plus étroite entre
processus, il faut un jeton vérifiable sans donner la clé privée aux workers.

## Décision

Le dispatch persistant vérifie un jeton Biscuit lorsque
GENOS_BISCUIT_DELEGATION_PUBLIC_KEY est configurée. Le bloc d'autorité porte
l'identité du sous-orchestrateur, les types d'enfants autorisés et une expiration.
Un bloc ajouté par un détenteur ne peut qu'ajouter des vérifications.
La signature, la portée, l'expiration et les identifiants révoqués dans le contrat
persistant sont contrôlés avant toute création d'enfant. Toute erreur refuse
l'action. La clé privée reste hors du backend qui effectue la vérification.

Ce contrôle complète le contrat persistant, la limite de cinq enfants, les
budgets, le bail MCP et la politique Cedar. L'absence de clé publique garde le
chemin historique du dispatch ; elle ne prouve pas que la délégation distante
soit activée. La révocation dépend d'une mise à jour du contrat persistant,
pas d'une propriété intrinsèque du jeton.

## Conséquences

### Positives

- Le détenteur peut restreindre un jeton sans posséder la clé de signature.
- Le dispatch vérifie la capacité avant l'effet de création.
- Les refus de portée, expiration, révocation et altération sont testés.

### Négatives

- Le backend charge le module WebAssembly Biscuit.
- L'émission des clés et la mise à jour des révocations restent des opérations
  d'administration distinctes.
- Le contrôle est conditionné à la configuration de la clé publique.

## Alternatives

- Transmettre un jeton opaque : chaque vérification dépendrait d'un service central.
- Remplacer le contrat persistant par Biscuit : les limites cumulatives de budget
  et de nombre d'enfants perdraient leur autorité transactionnelle.