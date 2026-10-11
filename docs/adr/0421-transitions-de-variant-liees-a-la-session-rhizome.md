# ADR 0421 — Transitions de variant liées à la session Rhizome

- **Statut** : Accepté
- **Date** : 2026-10-11
- **Domaine** : Rhizome, variants, persistance et confidentialité
- **Décideurs** : équipe GenOS
- **Lié à** : [ADR 0404](0404-liaison-mission-et-snapshot-rhizome.md)

## Contexte

`setVariant` pouvait remplacer directement la politique d'une session active.
Une bascule vers `ephemeral` changeait la politique de persistance après création
du registre ; une sortie de `private` retirait la contrainte de routage privé.
Les variants `cross_representation` et `procedural` portent aussi des obligations
de preuve qui ne peuvent être déduites du seul changement de nom.

## Décision

Les variants `persistent`, `ephemeral`, `private`, `cross_representation` et
`procedural` sont liés à la création de la session. Toute transition impliquant
l'un d'eux est refusée avec `RHIZOME_VARIANT_TRANSITION_REQUIRES_NEW_SESSION`,
sauf la répétition du même variant. Les autres transitions restent admises et
leur reçu contient le variant précédent, le nouveau variant, la version du
graphe et la révision de session. Une transition refusée ne produit ni nouvelle
révision ni événement durable.

Un passage à une autre portée exige donc une nouvelle session et le cycle
normal d'admission, de preuve et de snapshot. Le contrôleur dynamique utilise
le même `setVariant` et ne peut contourner cette garde.

## Limites et vérification

Cette décision ne certifie pas que toutes les transitions entre les sept autres
variants améliorent la mission. Elle protège les contrats de session dont le
changement requiert une migration absente. Le test SQLite
`test_rhizome_variant_transition_gate.js` couvre une transition admise, cinq
refus, l'absence de mutation après refus et la relecture après redémarrage.
