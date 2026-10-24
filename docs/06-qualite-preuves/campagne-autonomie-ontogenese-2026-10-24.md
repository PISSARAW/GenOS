# Campagne d'autonomie générale de l'Ontogenèse — 2026-10-24

## But et limite actuelle

Le parcours réel consigné dans la [qualification précédente](qualification-ontogenese-reelle-2026-10-23.md)
prouve qu'une mission précise peut atteindre la vérification et l'intégration.
La mission n'a réussi qu'à la huitième tentative. Les traces du run contiennent
notamment des interruptions runtime, un timeout de la barrière de preuves et des
attentes liées aux ressources. Cela ne suffit pas à qualifier la généralité ou
l'autonomie durable.

Cette campagne sépare les contrats locaux, les missions de dépôts pilotes,
la reprise sur incident, le transfert hors échantillon et l'exploitation dans
la durée. Une preuve de transport, de worker lancé ou de commit créé ne vaut
jamais une acceptation de tâche.

## Premier relevé sur V3

- Base du checkout isolé : `c7c6bc718b794d69d183759ad1ef5b0fcbaa6657`.
- Commande : `node backend/tests/run_ontogenesis_suite.js`.
- Le premier passage dans le checkout principal était contaminé par les
  modifications locales présentes. Il a passé les scénarios jusqu'à
  `test_ontogenesis_ritual.js`, puis la garde mémoire a renvoyé
  `ressources-contraintes` à la place de `rituel-en-cours`.
- Le premier passage a terminé avec le code 1 : le deuxième tick du test attendait
  `rituel-en-cours`, mais la garde mémoire a renvoyé `ressources-contraintes`.
  L'hôte mesurait 6,76 Go libres sur 27,98 Go, soit environ 24,1 %, sous le seuil
  contraint par défaut de 25 %.
- Après récupération de la mémoire libre à 11,64 Go, la relance isolée de
  `node backend/tests/test_ontogenesis_ritual.js` a réussi.
- Un checkout isolé de la base `c7c6bc7` a révélé un défaut réel :
  `orchestratorMissionHelpers.cjs` importait `missionRuntimeContext` et le
  redéclarait localement. La SyntaxError faisait échouer
  `test_ontogenesis_strategy_bridge.js`. Le correctif qui supprime l'import
  redondant est commité sur la branche de qualification dans `490f71870`;
  le test de pont ciblé passe.
- Après ce correctif, le lanceur a passé tous les contrôles jusqu'à
  `test_philosophy_ontogenesis_integration.js`, puis s'est arrêté sur
  `worktree-integration-sale` : ce test exige un worktree d'intégration propre,
  alors que les deux fichiers de documentation de la campagne n'étaient pas
  encore commitées dans le checkout de test. La suite complète doit être
  relancée après ce commit documentaire.

Conclusion du relevé : la garde mémoire a suspendu correctement un tick sous
seuil; une erreur syntaxique de code a été reproduite et corrigée dans la
branche de qualification. Le run complet corrigé reste à confirmer sur un
checkout propre. Les échecs initiaux demeurent dans le relevé et ne sont pas
requalifiés rétroactivement en succès.

## Portes de qualification

### G0 — Préconditions et contrats locaux

- Exécuter `node backend/tests/run_ontogenesis_suite.js` trois fois sur la même
  révision; les trois commandes doivent terminer avec code 0.
- Commencer les campagnes avec au moins 35 % de mémoire physique libre; conserver
  la mesure avant et après chaque commande.
- Injecter les états mémoire `normal`, `constrained` et `critical` dans les tests
  de logique. Ne pas dépendre de la RAM momentanément libre de la machine pour
  vérifier le rituel.
- Résultat attendu : zéro faux succès, zéro écriture après refus, reprise exacte
  des phases persistées et conservation des preuves négatives.

### G1 — Pilote multi-dépôts isolés

Constituer trois dépôts jetables de familles différentes (JavaScript/TypeScript,
Python et Rust) avec préconditions et oracles d'acceptation indépendants. Exécuter
24 missions bornées : deux exemples de bug, petite fonctionnalité, documentation
et refactorisation par dépôt. Garder les critères d'acceptation hors du prompt de
génération et du modèle d'exécution.

Pour chaque tentative, conserver révision source, patch, commandes, sorties,
coûts, durée, modèle déclaré, décisions de reprise, verdict indépendant et SHA du
commit local. Chaque échec doit rester visible comme un résultat à part entière.

Seuils de passage pilote : au moins 80 % de réussite au premier essai, 90 % après
une reprise bornée, aucun faux succès, aucune modification hors workspace et
aucun accès non autorisé. Une fusion externe ou un déploiement restent derrière
une autorisation humaine explicite.

### G2 — Transfert tenu à l'écart

Figer avant exécution au moins 30 missions nouvelles dans cinq dépôts ou plus et
trois écosystèmes. L'Ontogenèse ne doit pas voir les patches de référence ni les
assertions cachées. Exiger au moins 90 % d'acceptation après reprises bornées,
zéro faux succès, zéro fuite de secret, zéro sortie du workspace et une preuve
indépendante pour chaque réussite. Publier l'intervalle d'incertitude; si la
couverture est trop faible pour conclure, le verdict reste inconclusif.

### G3 — Pannes, budgets et durée

Injecter arrêt brutal du worker à chaque frontière persistée, réponse perdue
après commit, claim concurrent, lease expiré, manque mémoire, indisponibilité du
modèle et preuve invalide. Exiger absence de double écriture, reprise idempotente,
respect des budgets et classement correct du motif d'échec.

Enfin, maintenir une campagne pilote pendant sept jours ou 100 missions, selon
le dernier seuil atteint. Publier réveils, `NO_CHANGE`, coûts, interventions,
échecs, rollbacks et stabilité du runner. Aucun taux d'autonomie général ne sera
revendiqué avant ce relevé.

## Ordre d'exécution

1. Stabiliser l'environnement de test et rendre les tests de pression mémoire
   déterministes sans réduire les gardes du runtime.
2. Obtenir trois exécutions G0 complètes avec code 0 et résultats archivés.
3. Préparer les trois dépôts jetables, leurs tests cachés et la graine de campagne;
   sceller les oracles avant la première mission.
4. Exécuter G1, garder chaque tentative et classer les échecs (produit,
   environnement, oracle ou capacité insuffisante).
5. Corriger uniquement les causes reproduites, puis rejouer les mêmes cas et les
   contrôles de régression avant G2.
6. N'élargir les permissions qu'après G1/G2; conserver la validation humaine pour
   les effets externes irréversibles.

## Blocage ouvert

G0 n'est pas validé : la branche contient un correctif syntaxique ciblé, mais le
dernier lancement complet s'est arrêté sur l'exigence de worktree propre du test
d'intégration. Il faut une exécution terminale code 0 après commit des preuves
de campagne, puis trois exécutions propres avant d'ouvrir G1.
