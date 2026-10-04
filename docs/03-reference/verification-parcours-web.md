# Vérification indépendante des parcours web

Le service `WebJourneyVerifier` exécute un parcours Chromium avec Playwright. Il
retourne `confirmed` uniquement si la navigation, les actions et toutes les
assertions réussissent dans le navigateur. Un parcours cassé produit `regressed` ;
une erreur avant observation, par exemple l'absence du navigateur, produit
`inconclusive`. Dans les deux cas, `verified` reste `false`.

L'action `verify_journey` du gestionnaire `genos_browser_act` accepte un objet
`journey`. Les hôtes accessibles sont configurés par
`GENOS_BROWSER_VERIFICATION_HOSTS` (liste de noms séparés par des virgules).
La liste vide refuse toute navigation. `GENOS_BROWSER_EXECUTABLE_PATH` peut
désigner un Chromium installé ; sinon Playwright cherche son navigateur.
Les requêtes secondaires sont soumises à la même liste d'hôtes. Les URL avec
identifiants, les schémas non HTTP(S) et les redirections hors liste sont refusés.

Exemple de parcours :

```json
{
  "action": "verify_journey",
  "journey": {
    "url": "https://application.example/formulaire",
    "steps": [
      { "action": "fill", "role": "textbox", "name": "Nom", "value": "Ada" },
      { "action": "click", "role": "button", "name": "Envoyer" }
    ],
    "assertions": [
      { "type": "url", "expected": "https://application.example/confirme" },
      { "type": "text", "role": "heading", "name": "Demande reçue", "expected": "Demande reçue" }
    ]
  }
}
```

Les cibles utilisent leur rôle et leur nom accessible exacts. Les actions
permises sont `click`, `fill` et `select`. Les assertions permises sont `url`,
`text`, `visible` et `value`. Chaque parcours est limité à 20 actions et 20
assertions. Le reçu JSON est écrit dans `.genos/workspace/browser-verifications/`
(`GENOS_BROWSER_VERIFICATION_ARTIFACTS_DIR` permet de changer ce répertoire)
avec une empreinte SHA-256 dans `evidenceRefs`. Il conserve les résultats des
assertions et l'empreinte du parcours, sans recopier les valeurs des actions.
Le triplet `result`, `verifierRef`, `evidenceRefs` alimente le contrôle d'effet
SHEV décrit ci-dessous. Le reçu ne constitue pas, à lui seul, une décision de
promotion.

## Audits Lighthouse, axe-core et observations SHEV

`WebAuditService` exécute les capteurs demandés dans cet ordre : Lighthouse,
axe-core, puis le parcours Playwright. Chaque capteur retourne `confirmed`,
`regressed` ou `inconclusive`. Un échec mesuré classe le contrôle global comme
`regressed` ; l'absence de toute régression et un contrôle incomplet donnent
`inconclusive`. Seuls des contrôles tous confirmés donnent `confirmed`.

La configuration exige des seuils explicites pour les catégories Lighthouse
(`performance`, `accessibility`, `best-practices`, `seo`) et pour le nombre maximal
de violations axe-core. Ces seuils font partie de l'empreinte de configuration.
Le reçu JSON conserve les scores, les règles axe-core violées et les assertions
Playwright. L'analyse axe-core ne couvre que les règles automatisables ; un reçu
vert ne prouve pas l'accessibilité complète de l'application.

L'adaptateur `shev/adapters/webAuditAdapter.js` inscrit une observation
`degradation`, `state` ou `blind_spot` dans la dimension du mandat. Une
dégradation observée peut créer une initiative SHEV selon les droits du mandat.
Après la tâche du worker, `verifyWebEffect` relance les mêmes contrôles. Il
refuse un changement de critères, exige une tâche terminée et n'inscrit un effet
confirmé que sur un nouveau reçu observé. Un contrôle inconclusif conserve son
observation, sans confirmer l'effet. Le résultat du worker n'est pas une preuve.

Lighthouse est réservé à des URL choisies par l'opérateur : son navigateur
effectue ses propres requêtes et n'emploie pas l'interception Playwright des
ressources secondaires. Ne pas auditer une page non fiable avec ce capteur.
La liste `GENOS_BROWSER_VERIFICATION_HOSTS` reste obligatoire pour les URL
initiales et finales ; la liste vide refuse le contrôle.

Exécuter le test avec un navigateur disponible :

```bash
npm --prefix backend run test:web-journey
npm --prefix backend run test:web-audits
```
