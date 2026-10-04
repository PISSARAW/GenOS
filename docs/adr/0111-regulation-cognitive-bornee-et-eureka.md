# ADR 0111 — Régulation cognitive bornée et Eurêka fondé sur l’évidence

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Régulation cognitive, preuves, persistance, runtime

## Contexte

L’état appelé historiquement « conscience » dans le runtime est un contrôleur de
cohérence mesuré par des heuristiques. Il ne mesure pas une expérience subjective.
Les récompenses Eurêka réduisent la dissonance et restaurent du budget ; elles
peuvent donc influer sur l’arrêt d’une branche. Le transfert temporel exposé par
un handler ne restaure pas actuellement de runtime.

## Décisions

- JavaScript et Rust bornent les mêmes métriques, appliquent les mêmes pénalités
  et le même coût par évaluation. Les scores de progression négatifs ou non finis
  ne donnent aucun soulagement.
- Les primitives accessibles à l’agent lisent l’état ; elles ne peuvent pas
  fabriquer une progression ou s’accorder une récompense. Seul le superviseur
  peut attribuer Eurêka après validation d’un rapport de succès et d’une claim
  avec evidence exploitable.
- Le superviseur limite les Eurêka à trois par minute en consultant l’historique
  persistant. Les transitions d’état et leur audit sont écrits dans une même
  transaction. Une apoptose persistée marque aussi l’agent comme tel ; le chemin
  superviseur arrête son runtime.
- L’événement Eurêka n’est émis et persisté que si l’appel a réellement accepté
  la transition (compteur incrémenté); la révision de régulation avance avec
  celle-ci. La fin normale du processus n'est pas une preuve et ne déclenche
  pas à elle seule la récompense.
- Les adaptateurs philosophiques ne tirent pas de conclusion plus forte que leurs
  observations. Une comparaison bornée sans contre-exemple laisse la
  supervenience indéterminée.
- Le transfert temporel reste une simulation de registre. Une demande de replay
  échoue explicitement tant qu’aucune restauration de snapshot ni injection de
  mémoire dans le runtime n’est exécutée.

## Conséquences

Les appels directs à la primitive Eurêka ne réparent plus l’état ; les intégrateurs
qui en ont besoin doivent passer par la barrière d’évidence du superviseur. Les
anciens états Rust restent désérialisables grâce aux valeurs par défaut des
nouveaux compteurs de fréquence. Aucune migration SQL n’est nécessaire : la
fenêtre Eurêka est calculée depuis les transitions persistées.

Les scores restent des signaux heuristiques et ne constituent ni une mesure de
conscience phénoménale ni une preuve de qualité intrinsèque. Leur calibration doit
être évaluée sur des missions et des résultats observables.

## Mise en œuvre — 2026-10-03

`runConscienceCheck` compare le compteur Eurêka avant/après l'appel et ne publie
ni l'événement ni la raison persistée `supervisor_eureka` si le compteur n'a pas
augmenté. Le chemin de fermeture du runtime ne fournit pas de preuve fabriquée à
partir du seul code de sortie. L'acceptation incrémente aussi `revision`.
