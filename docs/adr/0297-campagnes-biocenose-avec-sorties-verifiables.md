# ADR 0297 — Campagnes Biocénose avec sorties vérifiables

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Biocénose, formation et qualification avec modèle local
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0292, ADR 0295

## Contexte

Le script des six niveaux Biocénose envoyait des instructions JSON incomplètes
au modèle local : les jugements omettaient les abstentions et les arguments
étaient demandés comme des chaînes au lieu d'objets `statement`. Il remplaçait
les erreurs de modèle par de faux jugements et transformait un arrêt au premier
pas en désaccord irréductible affiché comme une exécution réussie. Le variant
Adversarial Assembly ne recevait pas de membre au rôle `adversarial_reviewer`.

## Décision

Le script demande les structures attendues par les contrats et transmet le
claim assigné à la revue. Une réponse vide, non JSON ou une erreur Ollama est
un échec explicite. Un pas bloqué ne déclenche pas une finalisation forcée et
le rapport ne compte une exécution comme réussie que si les jugements et un
verdict persisté existent. Le résultat du jugement est relu dans SQLite. Le
code de sortie est non nul si un niveau échoue. Le niveau peut être choisi par
`GENOS_BIOCENOSE_LEVEL` pour une reproduction ciblée.

Lors de la formation `adversarial_assembly`, le membre du poste reviewer reçoit
le rôle `adversarial_reviewer`. Il reste compté comme reviewer dans les
mesures de diversité. La variante `hybrid_oracle_community` conserve son exigence
de vérificateur déterministe ; le script ne fabrique aucun reçu pour la satisfaire.

## Conséquences

- Les échecs de campagne sont visibles dans le JSON, les logs et le code de
  sortie ; une escalade légitime reste distincte d'une exécution bloquée.
- Les sorties Ollama restent des observations de mission. Elles ne qualifient
  pas automatiquement une variante ni la qualité du jugement.
- Les six niveaux ne couvrent pas les douze variantes Biocénose, et encore
  moins les 95 variantes canoniques du dépôt.
