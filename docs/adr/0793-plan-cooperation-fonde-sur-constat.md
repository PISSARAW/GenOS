# ADR 0793 — Plan de coopération fondé sur un constat vérifié

- **Statut** : Accepté
- **Date** : 2026-11-04
- **Domaine** : orchestration, preuves et qualification LLM

## Contexte

Les deux essais Qwen du 4 novembre ont refusé le plan avant tout worker : types
inventés, puis daemon placé après la restauration malgré un schéma enum. Le
contrat exposé au modèle ne décrivait pas toutes les contraintes du validateur.
La planification précédait même le constat. Les résultats négatifs sont conservés
dans [la fiche de preuve](../06-qualite-preuves/cooperation-llm-plan-refuse-2026-11-04.md).

## Décision

Le pilote de qualification exécute d'abord `resident_daemon`. Avant l'appel du
planificateur, il relit son binding, son reçu biologique et son événement terminal
persistants. Le reçu doit être sémantiquement vérifié, le worker doit appartenir
à la mission et à son contrôleur, et `trustedEvent` doit accepter sa preuve native
dans le tenant courant. Les octets sources du workspace sont confrontés aux
SHA-256 scellés de l'observation. Un changement ou une preuve manquante interdit
l'appel au planificateur.

Le modèle reçoit ensuite un constat réduit, avec run, reçu, preuve, empreintes,
mesure d'anomalie, valeurs et indices d'origine. Le catalogue structuré contient
les trois rôles restants et leurs prérequis. Le schéma de réponse borne le
vocabulaire et lie `findingRunId` au run fourni ; il ne fixe pas une séquence de
sortie comme constante. Les mêmes règles sont exposées au modèle et contrôlées
par le validateur :

- sans anomalie : `stop`, aucune étape ;
- avec anomalie : `repair`, spécialiste, vérificateur et récupération conditionnelle,
  une occurrence par type et tous les prérequis disponibles avant leur consommateur ;
- aucune référence étrangère, future, cyclique ou dupliquée, aucun daemon relancé
  par ce plan de réponse.

Le pilote exécute le plan accepté avec les handlers des types existants. Les
objectifs du modèle entrent dans le contexte des workers, sans augmenter leurs
droits. La restauration exige encore un verdict accepté, un digest courant
différent et un bail explicite ; elle reste dans la capsule. Les contrôles natifs
et l'autorité du contrôleur sont conservés.

Le rapport devient `genos.worker-cooperation-live/v3`, distingue constat et
réponse, conserve l'entrée exacte du planificateur et compte zéro token planner
s'il n'a jamais été appelé. Une tentative sans mesure reste inconnue. Le budget
planner devient 768 tokens de sortie et 4 096 au total, ce qui inclut le dossier ;
les workers conservent leur plafond partagé de 64 000 tokens.

## Conséquences

Le lien daemon → plan devient vérifiable, ainsi que l'arrêt d'une allocation saine.
Un plan mal ordonné échoue après le constat mais avant le spécialiste. Une
abstention du daemon n'entraîne aucun appel de planification. Les tests de
transport contrôlé ne prouvent toujours pas la compétence d'un vrai LLM ; la
qualification réelle doit conserver ses échecs. Le catalogue à trois rôles et
ses préconditions restent un protocole borné, pas une preuve d'autonomie générale.

## Alternatives

- Ajouter seulement des enums : insuffisant dans l'expérience conservée.
- Reclasser silencieusement les étapes ou imposer toute la sortie : cela masquerait
  le défaut de planification.
- Fournir le dossier en mémoire sans vérifier sa persistance et ses sources :
  cela permettrait une passation périmée ou appartenant à une autre mission.
