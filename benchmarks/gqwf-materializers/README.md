# Qualification appariée des matérialiseurs GQWF

Ce protocole compare chaque backend physique disponible à `portable-copy-v1`
sur des racines et des mutations déterministes identiques. Chaque bras utilise
une fixture neuve afin de mesurer une matérialisation froide. L'ordre des bras
alterne et trois répétitions au minimum sont imposées.

```powershell
node benchmarks/gqwf-materializers/compare.cjs `
  --files=8 --bytes=4096 --repetitions=3
```

Le rapport contient les capacités observées, les backends indisponibles, les
mesures brutes, les distributions et la parité des hashes candidats. Il ne
modifie jamais la politique `auto`, ne désigne pas de vainqueur global et ne
constitue pas une autorisation de déploiement. Une mesure exploitable doit être
rejouée sur le volume, le noyau et la charge réellement visés.
