# ADR 0323 — Reprise atomique du Natural Search Control Plane

- **Statut** : accepté
- **Date** : 2026-10-06
- **Domaine** : contrôle de recherche, SQLite, preuves et reprise
- **Décideurs** : mainteneurs GenOS
- **Lié à** : [Natural Search Control Plane](../01-concepts/natural-search-control-plane.md), [ADR 0032](0032-natural-search-control-plane.md)

## Contexte

Les phases 6–12 disposent de chemins runtime, mais sept écritures indépendantes
ne garantissent pas une reprise cohérente. Une restauration partielle pouvait
réinitialiser le génome, séparer la mémoire négative de l'actuateur et perdre
l'inertie du contrôleur. `INSERT OR REPLACE` sur une hypothèse détruisait ses
preuves lorsque les clés étrangères étaient activées.

Le senseur acceptait une provenance déclarée dans le payload, le forage inventait
un gain aléatoire et la culture fabriquait une validation. Ces signaux pouvaient
faire passer des propositions pour des résultats mesurés.

## Décision

1. Le runtime utilise un génome et une mémoire négative partagés avec l'actuateur.
   Une initialisation est publiée après sa restauration complète. Les opérations
   d'un agent sont sérialisées dans le processus.
2. `search_runtime_checkpoint` conserve un document versionné contenant ledger,
   preuves, pression exacte, hystérésis, senseur, compteurs, journal causal,
   reçus et états des sept modules. Une instruction SQLite remplace ce checkpoint
   atomiquement. Sa révision refuse un écrivain qui utilise une ancienne version.
3. Les tables historiques et `search_module_state` restent des projections et
   une voie de migration. La reprise privilégie le checkpoint atomique. Un échec
   avant son écriture conserve la précédente version récupérable. Une première
   version est créée avant de traiter le premier événement.
4. Un état corrompu, une version inconnue, une identité incompatible ou une
   écriture échouée produit une erreur. `clearSearchState` conserve la mémoire si
   le flush échoue. Le pipeline reçoit un signal pour arrêter le traitement courant.
5. Les hypothèses et preuves utilisent des UPSERT qui préservent identité,
   propriétaire, date de création et liens étrangers. La recharge ne rattache
   pas les preuves archivées à une hypothèse explicitement rouverte.
6. Senseur et ledger déterminent la provenance depuis la source runtime. Les
   claims, y compris `EVIDENCE_REPORT`, restent auto-déclarées. Les résultats
   d'outils sont observés; ils ne deviennent pas des vérifications par leur nom.
7. Le forage utilise le gain mesuré; le rayon et les signaux du ledger arrivent
   jusqu'à l'actuateur. La culture exige une validation fournie par l'appelant
   runtime, des références observées distinctes et le génome concerné. Les
   candidats transmis sont durablement reçus dans la même organisation et le
   même projet, puis peuvent produire des variants. Leur réception ne promeut
   aucune décision.

## Conséquences

### Positives

- Une réouverture SQLite retrouve un état cohérent après un arrêt de processus,
  y compris après des écritures partielles dans les projections.
- Les preuves ne disparaissent plus lors d'une mise à jour d'hypothèse.
- Les états de pression et d'hystérésis permettent de conserver la prochaine
  décision à entrées égales, sous réserve du vieillissement réel de la fenêtre.
- Les opérations ignorées ou échouées sont distinguées des opérations exécutées.

### Négatives

- Le document de checkpoint duplique les projections historiques. Les lectures
  des projections seules ne constituent pas une garantie de reprise atomique.
- Un conflit entre écrivains exige de recharger l'état durable avant de reprendre;
  aucune fusion implicite de décisions concurrentes n'est effectuée.
- Le journal causal est borné à 100 événements. Son analyse identifie des
  checkpoints; elle ne restaure pas un workspace externe. La spéciation crée
  des niches persistantes; elle ne lance pas de nouveaux agents.

## Alternatives

- Sept UPSERT indépendants : rejetés, car un crash peut séparer les générations.
- Une transaction globale pour tous les services partageant SQLite : demanderait
  une discipline commune pour chaque écriture du backend, au-delà de ce module.
- Ignorer les erreurs ou recréer un état aléatoire : rejetés, car cela masque une
  perte d'état et produit de faux reçus de succès.
