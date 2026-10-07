# Client VS Code de référence

Cette extension utilise `genos.ide/v1` : connexion avec identité persistante,
inspection de workspace, heartbeat, diagnostics, révocation et reconnexion.
Elle ouvre le run et sa provenance dans un document JSON natif de VS Code.

Créer le VSIX sans téléchargement ni publication :

```powershell
python integrations/ide/vscode/package_vsix.py "$env:TEMP/genos-runtime.vsix"
code --install-extension "$env:TEMP/genos-runtime.vsix"
```

Dans la palette, lancer **GenOS: Connecter le workspace**, puis renseigner
l’URL du backend, l’organisation, le projet, le workspace, l’agent et une clé
d’accès. HTTP est accepté uniquement sur loopback ; une destination distante
exige HTTPS. Les redirections sont refusées pour préserver la destination de
la clé. Le token est conservé dans `ExtensionContext.secrets`, jamais dans la
configuration. **GenOS: Inspecter l’exécution** affiche l’état réel ;
**GenOS: Déconnecter** révoque l’intégration et supprime le token local.
Pour changer de destination ou corriger un identifiant, utiliser
**GenOS: Configurer la connexion**, puis reconnecter le workspace.

Le harnais Windows `node backend/tests/run_b06_client_journey.cjs <dossier-preuves>`
installe le VSIX dans un profil temporaire, différent du profil habituel.
Il faut Python, VS Code et Playwright/Chromium disponibles. `B06_PYTHON`,
`B06_CODE_ROOT` et `B06_BROWSER` permettent de désigner des installations locales.
Le driver de test est une autre extension : le test exige que GenOS soit chargé
depuis le dossier d’extensions installées, puis utilise `vscode.commands` et
relit le document réellement ouvert dans l’éditeur. Un simple mock de VS Code
ne satisfait pas cette vérification.

JetBrains et Antigravity restent des cibles du contrat ; ce package livre
uniquement le client VS Code. Il ne synchronise pas les buffers et ne donne
aucune autorité de promotion supplémentaire.
