# Point 1/6 : Curiosity basée sur le progrès d'apprentissage

## Ce qui change
- Curiosité naïve "non observé = curieux" → calcul multi-signal
- N(x), IG(x), LP(x), A(x), -Cost, -Risk
- LP(x) dominant : évite le piège noisy-TV (arXiv:2211.10515)
- Conforme à PMC8514490 (humains = progrès d'apprentissage)

## Fichiers créés
- backend/src/services/curiosityService.js
- backend/src/services/curiosityExplorerService.js

## Fichiers modifiés
- backend/tests/curiosityExplorerService.test.js (ajout)

## Validation
- `node backend/test_curiosity_manual.js` → tous PASS
- `npx --prefix backend vitest run backend/tests/curiosityExplorerService.test.js`

## Preuves attendues
- Domaine "learnable-puzzle" sélectionné sur "noisy-TV" et "mastered-room"
- LP(x) élevé uniquement quand erreur diminue ET potentiel restant > 0
