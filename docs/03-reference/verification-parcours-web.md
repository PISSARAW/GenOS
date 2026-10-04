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
Le triplet `result`, `verifierRef`, `evidenceRefs` peut alimenter un vérificateur
d'effet SHEV lorsque ce module est présent dans la branche utilisée. Le reçu
ne constitue pas, à lui seul, une décision de promotion.

Exécuter le test avec un navigateur disponible :

```bash
npm --prefix backend run test:web-journey
```
