# Campagne native AGOW appariée

- **Statut** : qualification locale exécutée sur deux tâches connues.
- **Portée** : modes réels `shadow` et `bounded`, exécuteurs natifs `subset_sum`.
- **Décision** : [ADR](../../docs/adr/2026-11-02-campagne-native-agow-appariee.md).

Le runner prépare et checkpointe une base SQLite par tâche. Chaque bras reçoit
une copie identique de cette base. Les entrées sont communes et contrôlées par
hash ; les capsules et bases d'exécution sont propres à chaque bras.

Le manifeste précède les quatre missions. Il fixe tâches, modes, plafonds,
hashes initiaux, sources importantes et ordre des bras. L'ordre est inversé
pour la seconde tâche ; il n'est pas randomisé.

Le hash du manifeste, le cas et le mode sont inclus dans l'objectif du contrat
worker scellé. Le lecteur les recoupe avec le sujet attesté par les oracles.
Une modification a posteriori du manifeste et de ses fichiers annexes est ainsi
refusée. Les paramètres de calcul restent identiques dans chaque paire ; ces
métadonnées de provenance font varier le texte de l'objectif entre les bras.

```powershell
$env:TEMP = 'D:/GenOS-AGOW/temp'
$env:TMP = $env:TEMP
$env:GENOS_AGOW_PAIRED_ROOT = 'D:/GenOS-AGOW/paired-runs'
npm --prefix backend run test:agow:paired
node benchmarks/agow-paired-native/verify.cjs D:/GenOS-AGOW/paired-runs/<archive>
```

La commande npm exécute les tests de contrat, quatre bras en processus séparés,
les relectures natives et sept falsifications d'archive. Les fichiers modifiés
sont restaurés octet pour octet. `node benchmarks/agow-paired-native/run.cjs`
exécute seulement la campagne et sa vérification initiale. La racine par défaut
est sous `.genos-agent-worlds/`.

## Mesures et refus

La tâche à trois valeurs est résolue ; celle à 21 valeurs dépasse le domaine
d'énumération d'un oracle et conserve une perte inconnue. Chaque résultat exige
un run distinct, le mode de contrôle enregistré, la méthode et les plafonds
prévus, et une liaison AGOW postérieure au manifeste.

Une perte numérique exige une revalidation native et le hash de mesure du
journal. Les reçus signés, les observations canoniques et les gates restent
appliqués. Le lecteur d'archive ouvre des copies des bases finales. Une base
avec WAL ou journal de rollback non vide est refusée pour éviter la lecture
d'un ancien état du fichier principal. Les originaux restent fermés.

Les inconnus restent dans le dénominateur. Leur perte parcourt `[0,1]` pour
calculer des bornes arithmétiques de différence `bounded - shadow`. La moyenne
des seules paires connues et sa couverture sont explicites. Les bornes ne sont
pas des intervalles de confiance. Les coûts décrivent uniquement les processus
d'oracle et leurs temps mesurés ; le coût financier local reste `null`.

## Artefacts et limites

L'archive conserve manifeste, rapport, vérification, bases initiales et finales,
résultats et logs par bras. Les relectures créent des copies `.recheck-*`.
Le manifeste épingle des sources importantes, sans archiver toutes les
dépendances transitives. Une défaillance du driver interrompt la qualification
au lieu de réduire l'échantillon.

Les contraintes de fraîcheur et d'autorité natives s'appliquent à la relecture.
Une archive devenue trop ancienne doit être reproduite par une nouvelle campagne.
Les hashes et clés locales de qualification ne certifient pas une réplication
externe. Les états du système d'exploitation, les caches et tous les fichiers
transitoires ne sont pas figés. Les tâches sont connues et déterministes ;
aucun gain de politique ou déploiement n'est qualifié. `promotionAllowed` reste
`false`.

Le worker natif s'exécute dans le processus de son bras. Cette qualification
ne couvre pas le superviseur de processus d'un worker LLM.
