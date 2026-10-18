# ADR 0618 — Canari déterministe et réversible pour GQWF

- **Statut** : Accepté
- **Date** : 2026-10-18

## Contexte

Les tranches précédentes ont raccordé GQWF aux missions supervisées, aux workers,
à la promotion sous preuve, à la collecte explicite et à un protocole comparatif.
Ce dernier qualifie la sémantique Copy-on-Write dans sa fixture ; il ne constitue
pas une autorisation de généraliser GQWF en production.

Une activation progressive doit conserver le backend physique comme contrôle,
éviter qu'une même unité opérationnelle change de bras entre deux missions et
laisser une trace exploitable des préparations et échecs. Elle doit aussi pouvoir
être arrêtée sans déploiement et sans modifier les demandes GQWF explicites.

## Décision

Une mission orchestrateur peut demander une politique :

```json
{
  "executionPolicy": {
    "gqwfCanary": {
      "enabled": true,
      "policyId": "rollout-2026-10",
      "basisPoints": 500
    }
  }
}
```

Le bras est dérivé du SHA-256 de l'organisation, du projet optionnel, du
workspace et de `policyId`. Les huit premiers chiffres hexadécimaux déterminent
un bucket entre 0 et 9 999. La mission appartient au bras canari si ce bucket est
strictement inférieur à `basisPoints`. L'identifiant de mission n'entre pas dans
le calcul : un workspace reste donc dans le même bras tant que la politique et
son périmètre ne changent pas.

La décision dérivée est inscrite dans `mission.gqwfRollout` avant le
provisionnement. Le canari positionne ensuite le même opt-in `gqwfV2` que le
parcours manuel. Le contrôle conserve le provisionnement historique. Demander
simultanément `gqwfV2: true` et `gqwfCanary` est refusé afin d'éviter une autorité
ambiguë.

`GENOS_GQWF_CANARY_DISABLED=1` ou `true` est le coupe-circuit opérateur. Il place
toute nouvelle affectation canari dans le bras contrôle et conserve la raison
`operator_kill_switch`. Il ne désactive pas une demande manuelle `gqwfV2`.

Après création de l'execution run, l'affectation est persistée dans
`gqwf_rollout_decisions`. Son état progresse de `assigned` à `prepared`, puis à
`completed` ou `failed`. Le résultat de mission (`completed` ou `discarded`) est
conservé séparément de l'état technique du backend. `inspectRollout` expose les
comptes par bras et état ainsi que le taux d'échec terminal du bras canari.

## Frontières de sécurité

- Le backend physique reste le défaut quand aucune politique n'est fournie.
- Une politique désactivée est auditée comme contrôle ; elle n'active pas GQWF.
- Le périmètre déclaré est vérifié contre le workspace enregistré avant écriture.
- Une erreur après affectation est enregistrée `failed` et remontée à l'appelant.
- Aucune relance physique automatique n'est effectuée après une erreur GQWF :
  elle pourrait répéter des effets externes déjà produits par la mission.
- Aucun seuil de promotion ou de fermeture automatique n'est décidé ici.
- Le rapport comparatif local de la tranche 6 reste une preuve de protocole, pas
  une preuve de performance universelle ni une autorisation de production.

## Conséquences

Une activation bornée et reproductible devient possible sans changer le défaut.
Le coupe-circuit rend les affectations suivantes réversibles immédiatement, et
les décisions durables permettent à l'opérateur de mesurer les résultats avant
toute extension. Une politique ou un pourcentage modifié doit employer un nouvel
`policyId` lorsque l'opérateur souhaite distinguer les cohortes analytiques.

Le canari ne résout pas la reprise d'effets externes, la promotion automatique,
ni la définition d'un SLO. Ces décisions exigent des preuves séparées.

## Validation

`node backend/tests/test_gqwf_canary_rollout.js` couvre l'affectation stable, le
coupe-circuit, le contrôle désactivé, l'absence d'interférence avec l'opt-in
manuel, le provisionnement différé, les états durablement terminaux et
l'inspection agrégée.
