# ADR 0306 — Reconstruction des causes déclarées du forensic worker

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Workers, analyse d'incident, provenance
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0294, ADR 0305

## Contexte

Le `forensic_worker` exigeait un dossier causal, mais aucune route native ne
reconstruisait de liens à partir de reçus d'incident. Une simple succession
temporelle ne suffit pas à établir une cause.

## Décision

La méthode `trace_declared_causes` reçoit 2 à 1000 événements uniques,
horodatés et référencés. Un événement peut déclarer un antécédent déjà fourni
et une référence de reçu de causalité. L'exécuteur vérifie cet ordre et
reproduit les liens dans un `causal_dossier`, avec les références des deux
observations et du reçu déclaré. Il conserve les événements sans lien et
marque explicitement la vérité causale comme non vérifiée.

## Conséquences

Un cas d'incident devient mesurable par recalcul indépendant, sans consommer
de tokens de modèle. Le reçu `solver://sha256` relie le dossier aux entrées ;
il ne certifie pas l'authenticité externe des événements ou des attestations.
La méthode ne découvre aucune cause nouvelle et ne remplace pas une enquête.

## Alternatives

- Déduire la causalité de l'ordre des horodatages : rejeté, car l'ordre seul
  ne démontre pas un lien.
- Produire librement une chaîne causale à partir d'un récit : rejeté pour
  cette route, faute de reproduction et de provenance contrôlées.
