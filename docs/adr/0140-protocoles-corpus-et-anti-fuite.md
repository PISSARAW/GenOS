# ADR 0140 — Protocoles versionnés et corpus anti-fuite

## Statut

Accepté.

## Décision

Chaque évaluation porte un identifiant de protocole, une révision, une
hypothèse, des critères, des seeds et un manifeste séparant `train`, `dev` et
`reserved`. Les IDs de corpus doivent être stables et disjoints entre les
partitions. Le manifeste est haché avec une sérialisation déterministe puis
figé en mémoire avant l’exécution.

Le corpus `reserved` est contrôlé par le même validateur mais ne peut pas être
réutilisé dans `train` ou `dev`. Une modification du protocole ou d’un ID
change le hash et invalide le reçu associé.
