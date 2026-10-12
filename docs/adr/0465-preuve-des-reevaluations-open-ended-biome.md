# ADR 0465 — Preuve des réévaluations Open-Ended du Biome

## Statut

Accepté le 12 octobre 2026.

## Contexte

Une réévaluation d'environnement sans `evidenceRefs` propres était écartée de
la promotion de niche, mais ses champs étaient néanmoins recopiés dans
`environmentArchive`. Un résultat refusé pouvait ainsi modifier la lignée
utilisée comme parent de générations ultérieures.

## Décision

Les résultats de réévaluation passent par les mêmes conditions d'admission que
les candidats Open-Ended : références propres, nouveauté, utilité et coût
bornés. Seuls les candidats ainsi admis peuvent actualiser une entrée existante
de `environmentArchive`. Les environnements générés sans mesure restent des
hypothèses dans l'archive ; ils ne deviennent pas des mesures par héritage des
références de leur parent.

La présence d'une référence reste une déclaration de l'hôte, pas une preuve
indépendante de validité scientifique. La promotion d'une niche déjà connue
demeure interdite, même si sa réévaluation actualise l'archive.

## Conséquences

Un résultat sans preuve nouvelle ne modifie ni la niche ni l'archive de la
lignée. Un résultat admis peut mettre à jour les mesures archivées sans créer
une seconde niche. Les tests vérifient les deux chemins.
