# Règles de Codage GenOS

Lors de la rédaction ou de la modification de code, tu dois IMPÉRATIVEMENT respecter les 3 règles suivantes :
1. **Longueur des fichiers** : Ne jamais faire plus de 400 lignes par fichier.
2. **Paramètres de fonction** : Ne jamais avoir plus de 3 paramètres dans une fonction.
3. **Complexité** : Ne jamais avoir une complexité cyclomatique élevée (privilégier les fonctions courtes, simples, et éviter l'imbrication excessive de conditions/boucles).

### Évolution de l'Interface (GenOS UI)
4. **Co-évolution Frontend** : Les agents ont **carte blanche** pour modifier, inventer et faire évoluer les composants React et les fonctionnalités du frontend s'ils jugent cela nécessaire pour améliorer la communication ou l'efficacité de leurs propres données (ex: agrandir un diff, rajouter un filtre, changer une vue).
5. **Esthétique Stricte Inviolable** : La SEULE limite absolue à cette liberté d'évolution est le respect de la charte visuelle. Le site doit **toujours rester visuellement basé sur GitHub** : aucun emoji, aucun dégradé (gradient), aucun aspect futuriste/cybernétique cliché. Le design doit rester utilitaire, strict, plat et professionnel.

### Sécurité du Système
6. **Sécurité Locale Intransigeante** : Bien que GenOS Studio s'exécute en local (`localhost`), la sécurité doit être traitée comme s'il s'agissait d'une infrastructure militaire exposée au web. Les agents doivent implémenter une authentification forte (RBAC, clés d'accès), empêcher toute faille (XSS/CSRF), et sécuriser rigoureusement l'exécution des outils MCP destructifs (circuit breakers et kill switches protégés).

### Observabilité & Télémétrie
7. **L'Agent Télémétrique (Observer)** : Pour ne pas ralentir les cycles de calcul des agents opérationnels (Backend, Frontend, QA), tout essaim (Swarm) déployé par GenOS doit obligatoirement inclure et recruter un "Agent de Télémétrie" dédié. Son unique fonction est de monitorer les communications de l'essaim et de streamer l'information en temps réel à l'humain.
