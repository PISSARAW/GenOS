# Campagne causale bornée Holobionte

- **Statut** : harnais local exécutable, qualification limitée à trois cas arithmétiques
- **Portée** : comparaison appariée entre un témoin direct et le vrai service de mission Holobionte
- **Dernière revue** : 2026-10-20

## Contrat expérimental

Le harnais `benchmarks/holobiont-causal-campaign/` exécute chaque bras dans un
processus Node dédié. Le bras `baseline` ne charge pas le runtime Holobionte. Le bras
`holobiont` ouvre sa propre base SQLite en mémoire et appelle
`runHolobiontMission`. Aucun état de session ou de base n'est partagé entre les bras,
les cas ou les répétitions.

La campagne refuse plus de 20 cas, plus de 10 répétitions et un délai supérieur à
10 secondes par exécution. Le jeu livré contient trois cas et la valeur par défaut est
de trois répétitions, soit 18 exécutions de bras. Ces bornes sont des contrôles
d'exécution, pas une preuve de significativité statistique.

## Oracle et décision

`independent-oracle.cjs` est chargé par le processus de campagne, séparément des deux
workers. Il recalcule la somme depuis les entrées du cas et ne lit ni le statut de la
mission, ni son reçu, ni la décision du vérificateur interne du runtime. Chaque
répétition porte un verdict `PASS` ou `FAIL`; un cas est `PASS` seulement si les deux
bras passent toutes leurs répétitions. La campagne est `PASS` seulement si tous les
cas passent. Cette décision ne vaut ni promotion de runtime, ni preuve de causalité
générale.

Le rapport conserve la provenance SHA-256 des cas, de l'oracle et du worker. Il
conserve également les PID d'isolation, les preuves du runtime et les métriques de
chaque bras. Une métrique indisponible reste explicitement `null`; le témoin ne
fabrique donc ni consommation de jetons, ni admission, ni fermeture de session.
L'adaptateur d'essai du bras Holobionte produit aussi une preuve
`genos.holobiont-isolation-proof/v1` liée au `proofHash` de sa provenance. Son
`evidenceRef` est repris par le vérificateur et le reçu d'admission conserve les deux
liaisons; une preuve absente ou provenant d'un autre adaptateur est refusée.

## Exécution

```powershell
node benchmarks/holobiont-causal-campaign/run-campaign.cjs `
  --output target/holobiont-causal-report.json `
  --repetitions 3
```

Le fichier de sortie est créé avec une écriture exclusive : une campagne ne remplace
pas silencieusement un rapport existant. Le test ciblé est :

```powershell
node backend/tests/test_holobiont_causal_campaign.js
```

## Limites

- Les cas sont locaux, déterministes et arithmétiques; ils n'établissent aucun gain
  sur une mission métier, un modèle externe ou un déploiement distribué.
- Le bras témoin mesure seulement une exécution directe sans état persistant. Il ne
  représente pas toutes les architectures concurrentes possibles.
- L'oracle est structurellement séparé des exécuteurs, mais il appartient au même
  dépôt et n'est ni signé ni opéré par une autorité externe.
- Les durées sont informatives; le verdict dépend uniquement de l'exactitude observée
  sur tous les cas et toutes les répétitions.
