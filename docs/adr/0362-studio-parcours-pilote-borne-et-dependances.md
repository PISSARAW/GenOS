# ADR 0362 — Studio : parcours pilote borné et dépendances

- **Statut** : Accepté ; qualification du pilote distincte de celle des missions générales.
- **Date** : 2026-10-07.
- **Domaine** : Studio, intégration HTTP, workspace, preuves et revue.
- **Décideurs** : opérateur et agent de développement.
- **Lié à** : ADR 0360 et 0361 ; parcours P03 de STUDIO-TARGET-V1.

## Contexte

Après le socle B, l'opérateur demande « Étape C — Réussir un parcours pilote et
commite ». Le pilote doit traverser le vrai frontend et les vrais services,
pas seulement des réponses interceptées dans le navigateur.
Le backend importait un module MCP absent du checkout lors du simple chargement
de consommateurs sans appel MCP ; ce blocage préexistait à l'étape A.

## Décision

Livrer deux points atomiques :

- C01 : charger le verdict de domaine au début de `mcpExecutor.execute`, avant
  chargement DB, vérifications et transport. L'import des parcours indépendants
  ne dépend plus de ce module ; son absence refuse toujours l'appel MCP avant
  tout effet. Aucun verdict de secours ou droit nouveau n'est introduit.
- C02 : qualifier une tranche P03 bornée : dossier d'exécution de fixture → édition
  UTF-8/CAS réelle → snapshot → conflit/refus → restauration → revue signée et
  vérification indépendante → provenance persistée et inspection.

Le harnais crée une base SQLite, des identités et un workspace temporaires.
Le run initial en attente de revue est préparé par la fixture existante ; cela
ne prouve ni sa création autonome ni l'exécution d'une mission générale.
Les APIs, fichiers, snapshots, commandes de vérification et gates sont réels.
Aucune interception de réponse API n'est admise dans le scénario nominal du pilote.
Les signatures sont produites par le harnais de test, jamais par le navigateur.
Ce n'est pas la participation d'un humain indépendant réel.

Les preuves conservées indiquent révision, runtime, navigateur, entrées, chemins
relatifs, empreintes, refus, résultat de revue et portée. Elles ne contiennent
ni token ni secrets de signature et restent ignorées par Git.

## Conséquences

### Positives

- La disponibilité de Studio n'est pas couplée au chargement d'un module MCP inutilisé.
- Un pilote fait traverser les frontières UI/HTTP/store/filesystem/preuve.
- Les tests de socle à API fixtures ne sont pas confondus avec cette qualification.

### Négatives et limites

- L'exécution MCP complète reste indisponible si son module manque ; elle n'est
  pas certifiée par le démarrage du backend.
- L'environnement de test est synthétique, sans provider LLM externe.
- Le run initial de compatibilité n'établit pas une autorité mission native complète.
- Un pilote réussi n'est ni toute l'étape P03 ni une parité universelle.

## Alternatives

- Copier le module non suivi d'un autre travail : rejeté, frontières Git et provenance.
- Ignorer le verdict pour faire passer un appel : rejeté, violation fail-closed.
- Intercepter les APIs du pilote : rejeté pour la preuve d'effets réels.
- Déclarer toutes les missions qualifiées après ce cas : rejeté, généralisation indue.

## Références

- [Contrat directeur](../03-reference/studio-contrat-directeur.md).
- [Socle Studio](0361-studio-socle-requetes-actions-et-brouillons.md).
- [Suivi](../06-qualite-preuves/studio-parite-suivi.md).
