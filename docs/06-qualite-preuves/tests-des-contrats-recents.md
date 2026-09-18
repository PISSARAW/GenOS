# Validation des contrats récemment documentés

- **Statut** : Implémenté comme protocole de validation
- **Portée** : Product Proofs, fédération, dossiers, notifications, rollouts et bridge Rust.
- **Dernière revue** : 2026-09-18

## 1. Principe

Chaque contrat doit être testé sur trois axes : comportement nominal, refus sécurisé et
preuve persistée. Un test vert ne vaut que pour le scénario et la configuration
observés.

\[
Evidence_{test}=Result\land Trace\land Scope\land Reproducible
\]

## 2. Matrice

| Domaine | Nominal | Refus obligatoire | Evidence attendue |
| --- | --- | --- | --- |
| Product Proof | preuve complète | workspace hors scope | artefact + événements |
| OIDC/SAML | callback valide | nonce, signature ou certificat invalide | audit + identité |
| Dossier agent | synthèse avec influence | dossier vide/incohérent | rapport de barrière |
| Notifications | seuil atteint | tenant différent | préférence + corrélation |
| Rollout | promotion canary | métrique au-dessus du seuil | décision + ledger |
| Rust bridge | diff/replay valide | commande ou scope invalide | résultat CLI |
| Approvals | approbation suivie d’exécution | lease ou permission absente | approbation + audit |

## 3. Scénarios reproductibles

### Product Proof

1. Créer deux branches isolées.
2. Injecter une erreur connue dans une seule branche.
3. Exécuter `/api/product-proofs/safe-debugging/run`.
4. Vérifier que la branche fautive est identifiée et que l’evidence est produite.

### Fédération

1. Utiliser un IdP de test avec une clé connue.
2. Rejouer un callback déjà consommé.
3. Vérifier le rejet et l’absence de nouvelle session.

### Rollout

1. Déployer `candidate` à 10 %.
2. Enregistrer 1 000 requêtes et 8 erreurs.
3. Calculer `ErrorRate=8/1000=0,008`.
4. Décider avec un seuil de `0,02` et vérifier la promotion.
5. Rejouer avec 30 erreurs et vérifier le rollback.

## 4. Tests d’isolation

Pour chaque route tenant-scoped, répéter le test avec :

- le bon couple `organization_id` / `project_id` ;
- un projet différent de la même organisation ;
- une organisation différente ;
- des en-têtes incomplets.

Le résultat attendu est un refus explicite ou une liste vide, jamais une fuite de
ressource.

## 5. Tests scientifiques et limites

Les analogies biologiques doivent être testées comme des politiques observables : une
« barrière », une « conscience » ou une « homéostasie » n’est pas une preuve de
propriété biologique. Les rapports doivent séparer mesure, interprétation et métaphore.

## 6. Critères de sortie

Une fonctionnalité est documentée comme opérationnelle seulement si :

1. le scénario nominal est reproductible ;
2. le refus critique est testé ;
3. l’artefact peut être corrélé à un trace ID ;
4. le scope tenant est vérifié ;
5. la limite connue est écrite ;
6. la commande ou route est présente dans la documentation de référence.
