# RÃ¨gles de Codage GenOS

Lors de la rÃ©daction ou de la modification de code, tu dois IMPÃ‰RATIVEMENT respecter les 3 rÃ¨gles suivantes :
1. **Longueur des fichiers** : Ne jamais faire plus de 400 lignes par fichier.
2. **ParamÃ¨tres de fonction** : Ne jamais avoir plus de 3 paramÃ¨tres dans une fonction.
3. **ComplexitÃ©** : Ne jamais avoir une complexitÃ© cyclomatique Ã©levÃ©e (privilÃ©gier les fonctions courtes, simples, et Ã©viter l'imbrication excessive de conditions/boucles).

### Ã‰volution de l'Interface (GenOS UI)
4. **Co-Ã©volution Frontend** : Les agents ont **carte blanche** pour modifier, inventer et faire Ã©voluer les composants React et les fonctionnalitÃ©s du frontend s'ils jugent cela nÃ©cessaire pour amÃ©liorer la communication ou l'efficacitÃ© de leurs propres donnÃ©es (ex: agrandir un diff, rajouter un filtre, changer une vue).
5. **EsthÃ©tique Stricte Inviolable** : La SEULE limite absolue Ã  cette libertÃ© d'Ã©volution est le respect de la charte visuelle. Le site doit **toujours rester visuellement basÃ© sur GitHub** : aucun emoji, aucun dÃ©gradÃ© (gradient), aucun aspect futuriste/cybernÃ©tique clichÃ©. Le design doit rester utilitaire, strict, plat et professionnel.

### SÃ©curitÃ© du SystÃ¨me
6. **SÃ©curitÃ© Locale Intransigeante** : Bien que GenOS Studio s'exÃ©cute en local (`localhost`), la sÃ©curitÃ© doit Ãªtre traitÃ©e comme s'il s'agissait d'une infrastructure militaire exposÃ©e au web. Les agents doivent implÃ©menter une authentification forte (RBAC, clÃ©s d'accÃ¨s), empÃªcher toute faille (XSS/CSRF), et sÃ©curiser rigoureusement l'exÃ©cution des outils MCP destructifs (circuit breakers et kill switches protÃ©gÃ©s).

### ObservabilitÃ© & TÃ©lÃ©mÃ©trie
7. **L'Agent TÃ©lÃ©mÃ©trique (Observer)** : Pour ne pas ralentir les cycles de calcul des agents opÃ©rationnels (Backend, Frontend, QA), tout essaim (Swarm) dÃ©ployÃ© par GenOS doit obligatoirement inclure et recruter un "Agent de TÃ©lÃ©mÃ©trie" dÃ©diÃ©. Son unique fonction est de monitorer les communications de l'essaim et de streamer l'information en temps rÃ©el Ã  l'humain.

### Isolation Cognitive (Griot)
8. **ModÃ¨les Locaux Exclusifs** : Griot et tous ses sous-agents ont l'interdiction stricte d'utiliser des modÃ¨les Cloud (OpenAI, Anthropic). Ils sont les SEULS agents du systÃ¨me qui dÃ©pendent exclusivement de modÃ¨les locaux (Ollama, LM Studio, vLLM) via le Routeur Cognitif (auto-dÃ©couverte et sÃ©lection par complexitÃ©). Ceci garantit une Ã©tanchÃ©itÃ© totale des donnÃ©es.

### Format des Réponses (UI Markdown)
9. **Markdown IDE** : Toutes les réponses adressées à l'utilisateur doivent utiliser un formatage Markdown riche et aéré :
   - Listes à puces claires pour les détections et validations.
   - Blocs de code stricts avec coloration syntaxique (\\\ash, \\\ust, etc.).
   - Liens vers les fichiers affectés.
   - Si des modifications de code sont proposées, tu dois générer un bloc JSON de résumé de modifications encadré par \\\ile_modifications ... \\\ contenant les stats exactes.

