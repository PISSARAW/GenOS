# ADR 0743 — Export GCI de l'approbation de stratégie

- **Statut :** Accepté
- **Date :** 2026-10-24
- **Domaine :** Contrats GCI, approbation et preuve produit
- **Décideurs :** Équipe GenOS
- **Lié à :** ADR 0345 — GenOS Capability Inheritance (GCI), ADR 0742 — Déploiement de l'API GCI sur un VPS partagé

## Contexte

Le registre produit classe `PROMOTION_GATE` comme partiel. La route
`POST /api/execution-runs/:runId/approve` possède une implémentation, mais son
contrat d'acceptation et sa preuve HTTP tenant-scoped n'étaient pas référencés.
GCI ne publie que des exports explicites; la découverte catalogue doit rester
séparée de l'autorité nécessaire pour approuver un run.

## Décision

Publier `PROMOTION_GATE@1.0.0` en mode `linked` avec le descripteur
`spec/gci/exports/promotion-gate-v1.json`. Cet export couvre uniquement la route
d'approbation des runs de stratégie, appelée sous
`POST /api/execution-runs/{runId}/approve`. Son contrat exige `workspace:write`,
la portée organisation/projet, une signature HMAC-SHA256 liée au digest courant,
un reçu humain valide et la séparation entre demandeur et décideur. Son digest
épingle les fichiers de route, de contrôle, de politique et d'autorité inclus
dans le descripteur.

La maturité `integrated` du descripteur porte uniquement sur cette tranche
contractuelle. Le statut général `PROMOTION_GATE` demeure `partiel` tant que les
autres chemins de promotion et de fusion ne sont pas qualifiés. Une réponse
`completed` ne signifie pas `verified`; le contrat exige
`epistemicState.promotable: false`. La route GCI de découverte reste en lecture
seule. La clé de GenOSWork limitée à `gci:read` ne peut pas approuver de run.

Les preuves d'acceptation sont `test_promotion_gate_http.js` pour l'API réelle,
les refus d'authentification/permission/portée, l'approbation signée et la
découverte GCI scoped; `test_promotion_gate.js` pour les barrières métier;
`test_human_approval_promotion_gate.js` pour la séparation et les reçus; et
`test_gci_promotion_gate_export.js` pour le descripteur, son digest et ses
contrats d'entrée/sortie.

## Conséquences

### Positives

- Le pilote découvre un export GCI précis, versionné et lié à des preuves
  rejouables.
- La clé de catalogue reste séparée de la permission mutante `workspace:write`.
- L'état produit global reste fidèle aux chemins de promotion qui ne sont pas
  encore qualifiés.

### Négatives

- Les intégrateurs Linked doivent fournir leur propre handler; l'export ne crée
  pas une nouvelle API d'exécution GCI.
- Le digest doit être recalculé et le descripteur versionné lors d'une
  modification d'un fichier d'implémentation épinglé.

## Alternatives

- Marquer toutes les voies `PROMOTION_GATE` comme intégrées : rejeté, car les
  preuves couvrent uniquement l'approbation des runs de stratégie.
- Donner à GenOSWork `workspace:write` pour qu'il approuve des runs : rejeté,
  car le site pilote ne consomme que le catalogue GCI en lecture.
- Publier un descripteur sans contrat de signature ou de scope : rejeté, car il
  omet les contrôles qui déterminent l'acceptation de cette route.
