# ADR 0310 - Audits web indépendants pour SHEV

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : SHEV, vérification d'effet, qualité web
- **Décideurs** : équipe GenOS
- **Lié à** : [Vérification des parcours web](../03-reference/verification-parcours-web.md)

## Contexte

Le parcours Playwright du lot précédent rendait un verdict reproductible, mais
ne produisait pas d'observation SHEV. La qualité technique et l'accessibilité
nécessitent des capteurs distincts. Le résultat annoncé par un worker ne peut
pas prouver que son intervention a amélioré l'application.

## Décision

Un service d'audit compose des mesures Lighthouse, axe-core et Playwright sous
des seuils explicites. Chaque exécution produit un reçu local avec empreinte
SHA-256, résultats et références de preuve. Le service ne confirme le contrôle
que si tous les capteurs demandés concluent positivement. Une mesure absente ou
malformée reste inconclusive.

L'adaptateur SHEV inscrit l'observation dans une dimension du mandat. Après une
tâche terminée, il relance le même protocole et compare l'empreinte de la
configuration à celle de l'observation initiale. Il transmet seulement le reçu
de ce nouveau contrôle au mécanisme `recordProjectEffect`. Une mesure
inconclusive n'autorise pas la confirmation de l'effet.

Lighthouse utilise un navigateur séparé et peut charger des ressources hors de
l'URL initiale. Son emploi est limité à des pages de confiance désignées par
l'opérateur ; l'adaptateur ne l'expose pas comme outil de navigation arbitraire.
La liste d'hôtes autorisés contrôle les URL initiales et finales.

## Conséquences

### Positives

- Une régression web peut déclencher une initiative SHEV puis une mesure d'effet
  indépendante du compte rendu du worker.
- Les critères sont scellés entre les mesures avant et après l'intervention.
- Les reçus distinguent clairement régression, confirmation et inconclusion.

### Négatives

- Lighthouse ajoute une dépendance Chrome et un coût de mesure variable ; son
  score de performance reste sensible à l'environnement.
- Les audits automatisés d'accessibilité ne remplacent pas une revue humaine.
- Le navigateur Lighthouse ne partage pas l'interception des requêtes Playwright.

## Alternatives

- Utiliser uniquement Playwright : ne mesure ni score Lighthouse ni règles
  d'accessibilité axe-core.
- Accepter une attestation du worker : ne fournit aucune preuve indépendante.
