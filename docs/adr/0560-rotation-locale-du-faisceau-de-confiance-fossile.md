# ADR 0560 — Rotation locale du faisceau de confiance fossile

- **Statut** : accepté
- **Date** : 2026-10-16
- **Domaine** : fossilisation, attestation Ed25519, exploitation locale
- **Décideurs** : GenOS
- **Lié à** : ADR 0003, fossilisation; ADR 0525a, provenance signée

## Contexte

Les vérificateurs fossiles lisaient un ensemble de clés épinglées au démarrage
ou depuis une variable d’environnement. Retirer une clé exigeait alors de
redémarrer chaque processus; deux instances longues pouvaient appliquer des
politiques différentes pendant une rotation. Une installation partielle du
fichier de confiance pouvait aussi rendre les vérifications indisponibles.

## Décision

1. Lire les clés publiques de confiance depuis le fichier défini par
   `GENOS_FOSSIL_TRUSTED_PUBLIC_KEYS_FILE` à chaque vérification; conserver la
   variable JSON comme configuration compatible quand aucun chemin n’est donné.
2. Valider le format Ed25519 et vérifier que chaque identifiant correspond à
   l’empreinte de sa clé publique avant usage.
3. Installer un candidat uniquement après validation, en l’écrivant dans un
   fichier temporaire du même répertoire, en synchronisant son contenu, puis en
   le renommant atomiquement vers le chemin actif.
4. Déduire la rotation locale par chevauchement A/B, puis retrait de A. Les
   vérificateurs persistants relisent le faisceau au prochain appel et
   conservent les preuves historiques sans les déclarer valides après retrait
   de la clé.

## Conséquences

### Positives

- Les processus backend locaux observent le même faisceau actif sans redémarrage.
- Un candidat mal formé ou un identifiant forgé ne remplace pas le fichier actif.
- Les tests couvrent deux vérificateurs backend persistants, le chevauchement,
  le retrait de A, la conservation du fossile ancien et la vérification du
  fossile signé par B.

### Limites

- Le fichier est une source locale de confiance, pas un protocole de distribution
  multi-hôte; les hôtes distants peuvent encore diverger.
- L’installation ne signe pas le candidat et ne fournit ni génération de clés,
  ni stockage matériel de clé privée, ni contrôle anti-rollback.
- Les processus CLI reçoivent encore leur configuration au lancement; la preuve
  de rechargement sans redémarrage porte sur les vérificateurs backend locaux.

## Alternatives

- Garder uniquement les clés en variables d’environnement : rejeté, car un
  processus long-vivant ne peut pas observer la révocation sans redémarrage.
- Réécrire le fichier actif directement : rejeté, car un arrêt pendant l’écriture
  pourrait laisser un JSON tronqué.
- Présenter la rotation locale comme propagation distribuée : rejeté, car aucun
  mécanisme de livraison ou d’accord multi-hôte n’est implémenté.
