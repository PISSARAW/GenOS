# ADR 0341 — Contrats et traces de qualification Trinity

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : Qualification, provenance, replay
- **Portée** : lot L1 de la remédiation issue de l'audit des 48 missions Trinity.

## Contexte

Les 71 PASS locaux de la campagne ne démontrent ni le respect intégral des missions,
ni l'exécution des mécanismes propres aux variants, ni une promotion. Des protocoles
ajoutaient des fixtures et parfois des réponses attendues au brief. Les états
capturés, les états ultérieurs et les erreurs en cascade étaient difficiles à séparer.

L'audit conservé sous [audit-trinity-2026-10-06](../06-qualite-preuves/audit-trinity-2026-10-06/README.md)
couvre 48 missions, 88 tentatives et 324 mondes canoniques. Les cinq refus de
composition hétérogène font partie des 88 tentatives ; ils n'ont créé aucun monde.

## Décision

1. Un contrat public versionné conserve le texte original exact et son hash UTF-8.
   Exigences, fixtures, limites et références aux vérificateurs sont distinctes.
   L'oracle et son nonce aléatoire restent dans une enveloppe privée. Son engagement
   public ne permet pas de retrouver une petite réponse par dictionnaire.
2. Un résultat est un candidat tant que ses exigences n'ont pas de reçus indépendants,
   authentifiés par un vérificateur de confiance et liés au candidat et au contrat.
   Une fixture ne qualifie pas une mission ; des essais finis ne prouvent pas un théorème.
   Ce service n'accorde aucune autorité de promotion.
3. Le dispatch explicite scelle un manifest dans le design existant. Le bootstrap
   des workers conserve aussi un manifest du prompt effectif, du workspace, des
   identités, du contrat et du lease. Les routes configurées et les observations du
   fournisseur restent distinctes. L'absence d'observation vaut `unknown`.
4. Le journal existant conserve son format de résultat et son comportement de reprise.
   Une table append-only ajoute les débuts, échecs, fins, replays et observations,
   avec corrélations, séquences transactionnelles et chaîne de hashes. Une reprise
   après échec utilise une nouvelle identité de phase ; elle ne gomme pas l'échec.
5. Le registre historique est reconstruit à partir des audits scellés. Il vérifie
   couverture et hashes, distingue premier symptôme, cascade et hypothèse causale,
   et conserve les références manquantes comme inconnues.
6. Une capture SQLite utilise l'Online Backup API, incluant les données du WAL.
   Le cutoff fourni par l'appelant n'est pas présenté comme atomique avec la sauvegarde.

## Conséquences

Les contrats historiques restent compatibles, mais non qualifiés. Les anciens caches
n'acquièrent pas rétroactivement une chronologie d'exécution. Les SHA-256 attestent
l'intégrité relative aux empreintes conservées ; l'authentification des émetteurs
et des reçus demeure une responsabilité des gates existants et du lot L4.

L1 fournit les contrats, le registre et les traces nécessaires aux lots suivants.
Il ne réexécute pas les 48 missions, n'améliore pas encore les algorithmes des variants
et ne change ni Cedar, ni les leases, ni les limites de diversité ou de promotion.

L'empreinte Git distingue commit et arbre de travail observé. Le snapshot scellé
reste la référence de l'arbre exécuté. L'observation de fichiers Git n'est pas
une transaction atomique sur le dépôt partagé.

## Alternatives

- Compter tous les PASS historiques comme missions réussies : rejeté, car certains
  contrôles ne portaient que sur une fixture ou validaient une mauvaise réponse.
- Remplacer les erreurs par le dernier état : rejeté, car la cause initiale disparaît.
- Copier le fichier SQLite sans WAL : rejeté, car la copie peut perdre des données validées.
- Convertir automatiquement les briefs historiques en contrats approuvés : rejeté,
  car des critères sémantiques et des vérificateurs indépendants restent à qualifier.

## Validation

Voir le [rapport L1](../06-qualite-preuves/lot-1-trinity-contrats-et-traces.md) pour
les contrôles exécutés, les limites et les procédures reproductibles.
