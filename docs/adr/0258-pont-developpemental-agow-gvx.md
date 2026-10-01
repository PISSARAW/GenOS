# ADR 0258 — Pont développemental asymétrique entre AGOW et GVX

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, GVX, preuves, interoception
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0252, ADR 0253, ADR 0256

## Contexte

AGOW apprend vite à partir des trajectoires, erreurs, regrets et stratégies observés.
GVX porte les preuves longitudinales et les décisions de consolidation. Une boucle où
AGOW certifie ses propres observations comme des preuves GVX permettrait à un signal
rapporté de s'auto-valider.

## Décision

Le flux AGOW vers GVX est unidirectionnel et épistémiquement faible. Le pont enregistre
les signaux typés comme observations `reported`, avec provenance et références de preuve.
Il ne les transforme jamais en compétences maîtrisées ni en preuves vérifiées. Le
routage ne produit que des recommandations (`observe`, `create_hypothesis`,
`schedule_experiment` ou `ignore`); il ne lance pas d'action.

Le retour GVX vers AGOW passe par un adaptateur de reçus doté d'un vérificateur externe
injecté. Le reçu doit lier un identifiant, un vérificateur, une voie, un résultat et des
empreintes de preuve. Chaque reçu n'est crédité qu'une fois. La consolidation lente
requiert au moins trois reçus GVX distincts réussis et reste soumise à la politique de
plasticité AGOW.

L'interoception machine existante est la source canonique. Le pont transforme les
mesures disponibles en état GVX et en posture AGOW consultative. Toute dimension sans
capteur dédié reste explicitement inconnue; elle n'est pas inférée.

Les trajectoires cognitives réelles publient leurs signaux dans le scope du workspace
persisté de l'agent. Un scope fourni par l'appelant doit correspondre à ce scope; il ne
peut pas remplacer ni élargir le rattachement tenant stocké.

## Conséquences

### Positives

- Les observations AGOW ne peuvent pas s'auto-promouvoir en preuves GVX.
- Une preuve vérifiée peut influencer la plasticité lente sans faire de GVX un moteur
  d'apprentissage rapide.
- Les deux systèmes partagent la mesure machine et conservent l'incertitude des capteurs
  absents.

### Négatives

- Les agents sans workspace tenant ne publient pas de signaux développementaux GVX.
- Le déploiement doit configurer le secret des reçus épistémiques et inscrire les
  vérificateurs approuvés; le pont refuse les reçus non signés ou non liés à leur claim.
- Les recommandations demandent un consommateur explicite et ne déclenchent pas seules
  les expériences.

## Alternatives

- Laisser AGOW déclarer ses propres signaux vérifiés : rejeté, car cela crée une boucle
  d'auto-validation.
- Utiliser une source de capteurs différente pour chaque système : rejeté, car les
  états divergent sans provenance canonique.
- Déclencher automatiquement une hypothèse ou une expérience : rejeté, car le pont doit
  rester consultatif et préserver les gates existants.
