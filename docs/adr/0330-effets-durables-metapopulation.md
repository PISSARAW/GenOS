# ADR 0330 — Effets durables et reprise vérifiée de Metapopulation

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : Metapopulation, persistance, migrations et preuves
- **Dernière revue** : 2026-10-06

## Contexte

Les politiques régionales doivent produire des effets observables et récupérables.
Un plan, une obligation fédérale, un bail ou un hash ne prouvent ni une exécution
ni la validité de son résultat. Les interruptions entre assimilation, mesure,
rollback et enregistrement imposent une continuité des preuves.

## Décision

1. Garder PLAN sans effet et vérifier les résultats par relecture de leur scope
   exact. Inscrire le journal régional et l'état du cycle vérifié atomiquement.
   Reprendre après le dernier numéro vérifié, avec une limite de cycles par appel.
   Un cycle vide retourne `NO_ACTION`.
2. Déclarer une extinction seulement lorsque les workers observés sont tous
   indisponibles et qu'aucune fonction locale ne reste viable. Une mesure absente
   reste inconnue.
3. Exiger pour la recolonisation deux lignées distinctes compatibles, exclure les
   échecs du même patch et attendre une viabilité booléenne, une fitness bornée et
   une provenance. Créer le dème actif et son occupation dans la transaction
   d'acceptation. Un ancien dème ne peut libérer le patch de son successeur.
4. Persister les profils et résultats des îlots. Exiger les adaptateurs explicites
   Rust et solveur ; refuser la régression de génération et reprendre l'état de
   recherche seulement pour le même problème.
5. Appliquer les gardes communes à toutes les migrations de variants. Le receveur
   peut accepter, rejeter, demander des preuves ou adapter puis revalider.
   La même identité ne peut désigner une autre offre.
6. Persister la mesure rescue initiale avant assimilation, puis l'évaluation avant
   rollback. Reprendre les états acceptés ou annulés sans répéter l'effet déjà
   enregistré ; inscrire ensemble fitness finale et résultat.
7. Vérifier les réserves et les obligations fédérales par reçus durables.
   Fournir aux résidents des capsules réelles et des baux liés à la session et au
   dème, préserver leur identité et leur mémoire à la reprise, et persister le
   facteur de décroissance de mémoire.
8. Exiger une preuve d'évaluation pour la fitness locale et une liaison au hash
   du génome pour sa certification. Ne jamais transformer un hash en fitness.

## Conséquences

Le runtime régional reste borné et dépend des évaluateurs et adaptateurs fournis.
Les effets externes doivent respecter les clés d'idempotence : leur transaction
ne peut être garantie par SQLite seule. Capsule et bail ne lancent pas
automatiquement un processus de fond.

La suite `npm --prefix backend run test:metapopulation` couvre les 12 variants
documentés et les 4 profils historiques, les interruptions et les preuves
invalides. La validation du commit `5b18c834` a obtenu 10/10 suites dédiées.
Les fixtures ne certifient pas les moteurs externes ; le benchmark reste
synthétique. Cet ADR ne promeut pas la maturité globale du produit.

## Alternatives écartées

- Exécuter pendant PLAN : rendrait la planification mutante et la reprise ambiguë.
- Assimiler sur la seule fitness source : contournerait l'épreuve du receveur.
- Reconstruire une mesure rescue après assimilation : perdrait la baseline.
- Assimiler un reçu d'obligation à une preuve de satisfaction : accepterait une
  action non exécutée.
- Dériver la fitness d'un hash : produirait un score sans évaluation locale.

## Références

- [Runtime Metapopulation](../03-reference/runtime-metapopulation.md)
- [Fiche de topologie](../02-orchestration/topologies/metapopulation.md)
- [ADR 0047](0047-sessions-persistantes-metapopulation.md)
- [ADR 0293](0293-persistance-des-variants-metapopulation.md)
