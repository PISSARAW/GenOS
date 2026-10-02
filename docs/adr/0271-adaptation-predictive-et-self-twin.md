# ADR 0271 — Campagnes CTM externes et modèles adaptatifs

- **Statut** : Accepté
- **Date** : 2026-10-02
- **Domaine** : AGOW, Self-Twin, prédiction, expérimentation
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0269, ADR 0270

## Contexte

Les comparaisons CTM ont besoin de corpus externes identifiables et d'un contrôle de
dérive reproductible. Le Self-Twin et T0→T6 exposent déjà des écarts prédictifs, mais
un graphe structurel ou une précision heuristique ne démontrent ni une dépendance
causale apprise ni une incertitude calibrée.

## Décision

Les adaptateurs CTM reçoivent leurs cas depuis un lecteur externe injecté. Ils ne
distribuent pas les datasets. Ils normalisent les cas, calculent une empreinte SHA-256
du corpus chargé, et transmettent un manifeste et le même corpus aux bras isolés de
la campagne. Le scénario non stationnaire exige cinquante cas stables, puis un cas de
dérive. Les résultats restent en nursery GVX et ne promeuvent aucun claim.

Le Self-Twin peut agréger des effets d'arêtes. Les observations simples sont
qualifiées de corrélations; seules des interventions isolées, contrôlées, répétées,
avec reçus deviennent un soutien ou une réfutation causale.

T0→T6 reste le plan de contrôle des échelles. Un registre sépare les modèles
déterministe, gaussien, local appris et externe. La calibration persiste les erreurs,
NLL, score de Brier borné, couverture à 95 % et netteté par modèle, échelle et
contexte; sa précision alimente le pont runtime.

## Conséquences

### Positives

- Les campagnes enregistrent exactement quelle version et quelle empreinte de
  corpus ont été confrontées.
- Un changement de régime peut être mesuré sans inclure les datasets au runtime.
- Les assertions causales et les prédictions incertaines ont des gates fondés sur
  des interventions et observations persistées.

### Limites

- Un chargeur externe et un normaliseur restent nécessaires; aucun corpus ni moteur
  neuronal entraînable n'est livré ici.
- Le Self-Twin n'apprend pas encore la découverte d'intermédiaires inconnus ni la
  réparation d'une panne matérielle non annoncée.
- Les distributions actuelles sont diagonales; ces services ne constituent pas une
  reproduction du MBH-RNN ni une revendication de supériorité.

## Alternatives

- Embarquer les jeux de données dans le runtime : rejeté, car leur licence, taille et
  provenance doivent rester sous le contrôle du fournisseur.
- Qualifier toute corrélation d'effet causal : rejeté, car cela confond observation
  et intervention.
- Coupler T0→T6 à un modèle neuronal unique : rejeté, car les hôtes externes et les
  modèles inspectables n'ont pas les mêmes capacités.
