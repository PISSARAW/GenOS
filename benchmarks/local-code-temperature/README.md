# Pilote LocalCodeWorker : température 0,45 contre 0,2

Le pilote du 2026-11-04 utilise deux ADN Hachimoji DRAFT, le même modèle réel
Ollama `qwen2.5-coder:7b`, trois réparations JavaScript et trois répétitions
appariées par réparation. Il conserve chaque tentative et interdit la promotion.

## Périmètre du premier pilote

L'orchestration autonome a été refusée : `REQUIRED_PHASES_UNAVAILABLE`.
Les mesures couvrent l'expression des ADN, l'inférence réelle et l'exécuteur
de patches GenOS, sans reçu signé de mission autonome complète. Ce pilote
ne remplace pas une qualification du chemin complet du worker.

| Mesure | 0,45 | 0,2 |
| --- | ---: | ---: |
| Essais entièrement réussis | 3/9 | 3/9 |
| Assertions réussies | 68/108 | 83/108 |
| Tokens | 4188 | 4157 |
| Génération médiane, ms | 9851,6 | 10002,6 |
| Durée totale médiane, ms | 22089,1 | 17365,6 |

Le coût financier local reste inconnu. Ces neuf paires sur trois tâches connues
ne démontrent pas une supériorité générale. Aucun génome n'a été promu.

## Preuves conservées sur D:

Archive : `D:/GenOS-Experiments/local-code-temp-20261104/archive/pilot-1793787027905`.

- `manifest.json` : protocole, ordonnancement, budgets, modèle et empreintes ;
  SHA canonique du contenu : `ca8ab2695417ea6e78b961af84ad6abe37a8781542d657d0ff320e079d43af3c`.
- `evidence-index.json` : 236 fichiers archivés ; SHA-256 du fichier :
  `c3c9d7f68687b794173bd9e8654b8358b036a965d8c1985eae29bcb3f1854e88`.
- `verifications/replay-1793787597664/verification.json` : rejeu indépendant
  PASS des 18 résultats et rejet d'une température falsifiée ; SHA-256 :
  `af59fe3ed01ad91e0da5f80628f0d38a28f87270b50e8debd9e9f64555c0ad5f`.
- Le premier contrôle incomplet (expiration HTTP de la sonde finale du modèle)
  reste dans l'archive. Aucune inférence mesurée n'a été relancée.

Les artefacts générés et les bases ne sont pas versionnés. Les empreintes
permettent de contrôler les fichiers locaux ; elles ne sont pas des signatures
de qualification GenOS.

## Reproduction du pilote réduit

Les scripts versionnés reprennent le banc archivé, avec résolution configurable
du répertoire de laboratoire et des dépendances. Les scripts exacts de la mesure
historique restent scellés par son manifeste sur D:.

Définir `GENOS_TEMPERATURE_LAB` vers le laboratoire sur D: et, au besoin,
`GENOS_TEMPERATURE_DEPENDENCIES` vers un checkout contenant les dépendances Node.
Le laboratoire doit contenir `runtime/source`, `runtime/full-source.tar` et
`runtime/genos.exe`, figés depuis le commit de migration
`9398e117d14355575b758088208ebb883845234e`.

```powershell
node benchmarks/local-code-temperature/preflight.cjs
node benchmarks/local-code-temperature/prepare.cjs
node benchmarks/local-code-temperature/run.cjs <archive-retournee>
node benchmarks/local-code-temperature/verify.cjs <archive-retournee>
```

Budget par tentative : 8192 tokens totaux, 1536 tokens générés maximum,
contexte 8192, délai 120 secondes et une seule génération. Préchauffage exclu.
Tout échec reste dans le dénominateur ; le vérificateur n'appelle pas le modèle
pour générer une nouvelle réponse.
