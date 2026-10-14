# ADR 0496 — Exiger un reçu de vérification lié au résultat

- **Statut** : Accepté et implémenté pour la mémoire de requête.
- **Date** : 2026-10-15
- **Domaine** : Preuve avant promotion et réutilisation des résultats.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0492, refus des résultats provisoires ; ADR 0493, dépendances ; ADR 0494, scope workspace ; ADR 0495, atomicité.

## Contexte

`bestKnownResultService` traitait le champ d'entrée `status: VERIFIED` comme une
preuve. Tout appelant pouvait donc proposer un résultat arbitraire avec ce
statut et le rendre champion/réutilisable sans reçu vérifié.

## Décision

Un candidat `VERIFIED` doit inclure un reçu signé que le service valide avec le
registre des digests de vérificateurs de confiance. Le reçu doit déclarer un
résultat vérifié et indépendant; son digest couvre le contenu, les éléments
d'évidence, les dépendances et le scope workspace. Le reçu est persisté dans
`evidence_json` avec les éléments qu'il atteste. La promotion directe relit et
revalide le reçu stocké. Les autres statuts restent des candidats non promus.

## Conséquences

### Positives

- Un booléen ou statut déclaré par l'appelant ne suffit plus à promouvoir.
- Une signature altérée, un vérificateur inconnu, un reçu dépendant ou un reçu
  lié à un autre digest/scope est refusé.
- La vérification du reçu est répétée au moment de chaque promotion, après
  lecture de la preuve persistée.

### Négatives

- Les consommateurs doivent obtenir un reçu valide et disposer de la clé de
  vérification configurée; l'ancienne API qui envoyait seulement `VERIFIED` est
  incompatible avec la promotion.
- Le reçu certifie le lien à l'évidence selon le registre local; il ne prouve
  pas à lui seul l'indépendance économique ou organisationnelle réelle du
  vérificateur, ni un rejeu complet du run.

## Alternatives

- Continuer à faire confiance au statut `VERIFIED` : rejeté, car c'est une
  déclaration contrôlée par l'appelant.
- Accepter une étiquette de vérificateur sans signature : rejeté, car elle ne
  permettrait pas de détecter la modification du reçu ou de ses liaisons.
