# 0336 — Cycle résident et vérification des daemons

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : Daemons, territoires, persistance, réparation et preuves
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0034, 0079, 0135, 0143, 0290, 0305

## Contexte

Le catalogue définissait dix phénotypes et huit organelles, mais le host ne
coordonnait pas leur cycle complet. Certaines routes n'utilisaient pas le
contrôleur résident. Des ticks augmentaient les révisions cognitives ; la reprise,
les cellules scouts et la clôture de réparation ne conservaient pas toutes les
garanties du contrat. Un détecteur statique ne démontre pas une causalité.

## Décision

Un ResidentDaemon reste l'unique propriétaire de son territoire. Son cycle
sérialisé réalise bootstrap, cartographie, interoception, sélection des phénotypes,
investigation, vérification, stigmergie, compte rendu et réconciliation. Les dix
familles déterminent la priorité des détecteurs ; elles ne créent pas dix runtimes
concurrents. Le catalogue est exposé par GET /api/daemon/types.

Le heartbeat persiste avant de modifier le cache et n'incrémente une révision que
sur demande explicite. Le host reprend en BOOTSTRAPPING, conserve les budgets de
réveil et le curseur interprocessus, attend les opérations en cours à l'arrêt et
revient au bootstrap après une erreur. Natural Search réutilise HypothesisLedger
et SearchPressureModel ; leur état territorial est conservé dans daemon_search_state.
Les observations identiques réutilisent leur hypothèse.

Le graphe dérivé est reconstruit transactionnellement ; un scan tronqué reste
STALE. Les chemins sont relatifs au territoire et confinés après résolution des
liens ; les répertoires de build et les mondes .genos-* sont exclus. Les cellules
scouts réservent atomiquement leur capacité et budget, vérifient TTL, HEAD et
provenance et persistent leur résultat avant publication.

Une réparation demeure un épisode confié à un worker dans une capsule séparée.
Le claim est atomique. SUCCEEDED exige un reçu persisté de deux exécutions réelles
réussies de la commande contrôlée, ancré au HEAD et au snapshot, lié au worker et
à la capsule, dont les changements restent dans le scope du bail. Une simple
réobservation n'ouvre pas un épisode causal et la clôture ne crée pas un statut
REPAIRED absent du contrat.

SentinelDaemonKeeper et l'interface WorkspaceGitDaemon restent compatibles via
les commandes explicites ; aucun autostart n'est activé implicitement et l'autofix
historique reste déprécié. La suite npm test:daemon isole base, configuration,
rapports, découverte Git et dossier Startup dans des fixtures temporaires.

## Conséquences

### Positives

- Les contrats du catalogue ont un chemin d'exécution commun et vérifiable.
- Reprise, concurrence, provenance et autorité sont testées explicitement.
- Les tests n'auditent plus les dépôts réels ni le Startup de l'utilisateur.

### Négatives

- La cartographie reste plafonnée à 2000 fichiers et 200 Ko par fichier.
- Le cycle automatique utilise des détecteurs déterministes ; une exploration
  coûteuse et la réparation restent soumises à des exécuteurs et baux explicites.
- Les résultats locaux ne suffisent pas à promouvoir la maturité empirique en
  STABLE : les évaluations live A/B/C, ablations et coûts restent requises.

## Alternatives

Créer un moteur de recherche par phénotype aurait dupliqué Natural Search et
l'autorité. Autoriser le résident à appliquer les corrections aurait contourné
les contrats Worker, capsule et preuve. Les deux options sont écartées.
