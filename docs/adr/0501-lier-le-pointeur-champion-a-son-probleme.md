# ADR 0501 — Lier le pointeur champion à son problème

- **Statut** : Accepté et implémenté pour la mémoire de requête.
- **Date** : 2026-10-15
- **Domaine** : Isolation workspace et intégrité des pointeurs de résultat.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0494, scope workspace ; ADR 0496, preuve liée au résultat ; ADR 0500, revalidation avant réutilisation.

## Contexte

`getChampion` recherchait la ligne `request_results` par l'ID pointé dans
`request_problems`. Le pointeur n'était pas vérifié contre le `semantic_id`
scopé. Une corruption ou réattribution SQLite pouvait donc faire retourner le
résultat d'un autre workspace à l'appelant.

## Décision

La lecture du champion exige à la fois `id = champion_result_id` et
`semantic_id = scopedSemanticId`. Un pointeur vers une ligne d'un autre
problème donne un miss avec `champion: null`; aucun contenu étranger n'est
retourné.

## Conséquences

### Positives

- La frontière de workspace est vérifiée au niveau de la ligne cible, même si
  le pointeur du problème est incohérent.
- Les tests corrompent temporairement le pointeur vers un autre workspace et
  constatent un résultat nul avant de restaurer le pointeur.

### Négatives

- Un pointeur incohérent reste à réparer ou à signaler séparément; la lecture
  échoue fermé mais ne fait pas de migration automatique de l'état.

## Alternatives

- Faire confiance au champ de pointeur seul : rejeté, car il ne garantit pas
  que la cible appartient au problème demandé.
- Charger la cible puis contrôler le scope en JavaScript : rejeté, car SQL peut
  exclure la ligne étrangère avant de la matérialiser pour l'appelant.
