# Coevolution Red Team / Blue Team

Cette demonstration est une simulation abstraite et deterministe. Elle
n'execute aucun payload, ne contacte aucun reseau et ne modifie aucune cible.
Elle sert a etudier l'heritage, la mutation et la selection de comportements
defensifs dans des mondes GenOS isoles.

```powershell
cargo run -p genos-cli -- experiment security-coevolution examples/security-coevolution/experiment.yaml --summary
```

La simulation cree quatre univers depuis `security-lab@world-0` : phishing,
attaque de dependance, elevation de privileges et mouvement lateral. Dans
chacun, les populations Red et Blue produisent trois descendants par
generation. Le meilleur genome offensif affronte les defenses mutees, puis un
observateur neutre enregistre probabilite de compromission, utilite defensive,
cout des faux positifs et progression de la course evolutive.

Avec 200 generations, la demo evalue 4 812 genomes et conserve :

- 2 400 mutations Red et 2 400 mutations Blue ;
- le parent, les genes et la mutation exacte de chaque descendant ;
- 800 observations independantes ;
- les quatre mondes initiaux et leurs populations finales ;
- la lignee des mondes, separee de la lignee genetique.

Le rapport complet est ecrit dans
`.genos/experiments/red-blue-coevolution-v1/reports/red-blue-coevolution-v1.json`.
