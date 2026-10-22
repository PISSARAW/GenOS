# Addendum préconfirmatoire v3.4 — format littéral du claim C

Date : 2026-10-22, après le smoke diagnostique C v3.3 et avant toute génération suivante.

Le smoke réel v3.3 a terminé avec `outcome: success`, le claim `confidence_percent is 58 and decision is defer`, et la citation `worker_self`. Le raisonnement de seuil est correct, mais l'oracle v3.2/v3.3 n'a pas reconnu le pourcentage ni le champ décision au format exact préenregistré.

Le texte du défi C précise désormais un gabarit de claim : `confidence_percent: <nombre affiché>% ; decision: <accept ou defer>`. Les chevrons indiquent des valeurs à remplacer; ils ne révèlent aucune valeur à l'agent. Aucun fait, seuil, bras, modèle ou critère de score ne change. L'oracle reste inchangé : valeur en pourcentage exacte, décision cohérente avec 80 %, référence `worker_self`. Les sorties v3.3 ne sont pas réévaluées.
