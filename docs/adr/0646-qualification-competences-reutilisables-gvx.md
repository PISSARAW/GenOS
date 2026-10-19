# ADR 0646 — Qualifier les compétences réutilisables GVX

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : GVX, compétences, provenance, transfert, autorité
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0265, ADR 0486, ADR 0573, ADR 0622

## Contexte

Une compétence multi-outils facile à réutiliser peut accélérer une mission sans pour
autant démontrer sa valeur, son origine ou son innocuité dans un autre domaine. Un nom
de compétence, un test source et une exécution réussie ne suffisent pas à autoriser sa
promotion. L'absence de lien avec un résultat dont une personne externe est responsable
permettrait également d'optimiser un score interne sans améliorer le projet.

## Décision

GVX introduit deux contrats purs et fail-closed :

1. `gvxReusableSkillManifest` scelle l'identité, la version sémantique, le hash de
   l'artefact, le domaine source, les événements de transformation et de preuve, les
   permissions demandées et une cible de rollback. Toute modification invalide le hash
   du manifeste. Une lease doit être non expirée, liée à ce hash, à cette version et à
   toutes les permissions demandées ; l'absence de lease vaut refus.
2. `gvxReusableSkillGate` demande au moins deux essais sur des jeux tenus à l'écart,
   deux vérificateurs indépendants et plusieurs domaines dont un distinct du domaine
   source. Le bénéfice doit être mesuré par une preuve indépendante, sur la métrique
   d'une obligation appartenant à un responsable externe identifié.
3. Deux fenêtres de surveillance dans des contextes distincts sont requises. Une
   dégradation ou un drapeau de régression produit `rollback_required` avec la cible
   scellée. Le rollback reste soumis à autorisation et n'est jamais exécuté par la gate.

Une issue positive est `ready_for_promotion_review`. Elle conserve
`promotionAuthority: none` et `automaticPromotion: false` : la preuve rend la revue
possible, elle n'accorde pas l'autorité de promouvoir.

## Conséquences

### Positives

- Les compétences sont adressables par version et contenu, avec une provenance
  exploitable plutôt qu'une simple étiquette.
- Un succès local ne masque pas un échec de transfert inter-domaines.
- La valeur observée reste reliée à une responsabilité projet externe au runtime.
- Les permissions, la détection de régression et le plan de retour arrière sont
  vérifiés avant toute revue de promotion.

### Négatives et limites

- Les contrats livrés évaluent des entrées déjà collectées ; ils ne lancent pas les
  essais, ne lisent pas les artefacts et ne vérifient pas eux-mêmes une signature de
  vérificateur. Les producteurs doivent passer par les registres et lecteurs GVX
  existants avant de construire ces entrées.
- La décision n'est pas encore persistée automatiquement dans le journal GVX et aucune
  route REST, gRPC ou MCP nouvelle n'est exposée.
- Deux domaines et deux fenêtres constituent une borne minimale, pas une preuve de
  généralisation universelle ni d'absence future de régression.

## Alternatives

- **Promouvoir après le test source** : rejeté, car cela confond mémorisation locale et
  transfert.
- **Déduire les permissions du nom de la compétence** : rejeté, car une convention de
  nommage ne constitue ni une lease ni une autorisation.
- **Déclencher automatiquement le rollback** : rejeté, car la détection n'accorde pas
  l'autorité de modifier le runtime.
- **Mesurer uniquement un score interne** : rejeté, car le bénéfice doit être attribué à
  une obligation projet et à son responsable externe.
