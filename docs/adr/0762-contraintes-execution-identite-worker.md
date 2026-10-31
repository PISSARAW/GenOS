# ADR 0762 — Contraintes d'exécution observées dans l'identité worker

## Contexte

Le prompt réellement envoyé à Qwen présentait « budget illimité » et « workers
illimités », à partir des valeurs par défaut nulles ou zéro du modèle de soi.
Le run possédait pourtant un plafond de 9 000 tokens et aucun droit de délégation.
Un inventaire d'outils du soi ne représentait pas nécessairement son bail courant.

## Décision

Après le contrôle d'identité, la projection du prompt reçoit les limites de la
mission runtime et du contrat déjà validés. Le budget affiché est le minimum des
plafonds connus ; le nombre d'enfants provient du contrat et les outils du bail.
Zéro reste zéro. Une donnée absente est « non observée », jamais « illimitée ».
Le modèle de soi persistant et ses preuves d'identité ne sont pas modifiés.

Cette projection décrit les limites ; elle ne donne aucun droit. Les contrôles
de bail, d'enveloppe, de budget et de circuit breaker restent les autorités.

## Conséquences et alternatives

Le prompt cesse de contredire les contrôles exécutables. Remplacer les limites
du runtime par celles du soi aurait créé une élévation de privilèges ; cette
alternative est rejetée. Le changement ne prouve aucun gain de calcul de Qwen.

Validation : `node backend/tests/test_worker_execution_prompt_bounds.cjs` contrôle
les limites concurrentes, zéro, l'absence de données et la non-mutation du soi.
