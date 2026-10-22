# Dépendances racine installées pour MCP

- Date : 2026-10-22
- Révision : `21bcecdaa`
- Commande D: : `npm ci --cache D:\GenOS\identity-llm-npm-cache --no-audit --no-fund`
- Résultat : PASS, exit code 0, 174 paquets ajoutés en 40 s.
- `require('puppeteer')` charge la version `25.10.0`.

Npm a bloqué le postinstall Puppeteer via sa règle `allowScripts` : le navigateur Chromium n’a pas été téléchargé. Le préflight MCP n’utilise pas le navigateur ; il requiert seulement le module au chargement. Toute expérience qui ouvre réellement un navigateur resterait non disponible.

Ce jalon corrige l’import manquant qui faisait tomber le registre MCP. La prochaine étape est de relancer A/E et de vérifier les événements de génération, pas seulement l’acceptation du dispatcher.
