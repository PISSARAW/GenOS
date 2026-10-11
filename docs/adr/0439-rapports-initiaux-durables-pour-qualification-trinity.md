# ADR 0439 — Rapports initiaux durables pour qualifier Trinity

- **Statut** : Accepté
- **Date** : 2026-10-11
- **Domaine** : Trinity, campagne nominale, journaux durables

## Contexte

La campagne nominale vérifiait les statuts des mondes et le journal de
comparaison, mais ne lisait pas le journal `initial_reports`. Des mondes
marqués `compared` pouvaient ainsi compter sans rapports de workers
persistés, y compris pour le variant `controlled`.

## Décision

- La campagne vérifie `initial_reports` en lecture seule avec son empreinte,
  sa métadonnée de phase et son événement terminal dans la trace append-only.
- Son empreinte d'entrée doit être la même que celle de `comparison`.
- Chaque monde initial attendu, trois ou seize pour `factorial`, doit avoir
  exactement un rapport `success`, sans échec, avec le même numéro et le même
  `agentId` que le monde enregistré.
- Une absence ou une divergence refuse la qualification avec
  `initial_reports_journal_not_verified`,
  `initial_reports_comparison_mismatch` ou
  `initial_reports_worlds_mismatch`.

## Limites

La présence d'un rapport `success` ne démontre pas à elle seule que ses
affirmations sont vraies. La qualification conserve les gates propres au
variant, les vérifications indépendantes du candidat et la signature AgentGit.
Cette décision ne qualifie aucune des douze missions post-correctifs.

## Alternatives

Se fier au seul statut des mondes SQLite aurait conservé un verdict sans
rapport initial relisible pour chaque worker.
