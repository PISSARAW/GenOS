# Biomimétisme & Sénescence Négligeable : Longévité sous Surveillance Renforcée

> Domaine : biologie du vieillissement (hydre, homard, tortue) — Statut : proposition de recherche

## 1. Fondement biologique
L'hydre et certaines tortues montrent une **sénescence négligeable** : mortalité quasi constante avec l'âge, régénération continue. Leur secret n'est pas l'immortalité mais deux conditions : régénération cellulaire permanente ET environnement contrôlé — compensées par un risque accru de dérives (le cancer computationnel de l'analogie : croissance incontrôlée). La longévité extrême exige donc une surveillance renforcée des dérives.

## 2. Formalisation GenOS
```
Classe Longevity(C) :
  Prérequis : télomérase autorisée (pas de limite de Hayflick) + régénération continue (blastème) +
              environnement stable garanti (monde dédié, BHE stricte)
  Contrepartie obligatoire : surveillance anti-dérive renforcée
    {détection de runaway growth : expansion de budget/empreinte sans justification ;
     audit phénotypique fréquent ; checkpoints serrés ; kill-switch humain documenté}
Justification : plus la durée de vie est longue, plus la probabilité cumulée de dérive tend vers 1 —
                la surveillance doit croître en conséquence (loi de Gompertz appliquée aux agents)
```

## 3. Mapping primitives existantes
- Télomères (doc sœur) — paramètre désactivé pour cette classe.
- Régénération (`regeneration.md`) — mécanisme de maintenance continue.
- BHE/checkpoints/apoptose — arsenal de surveillance.

## 4. Cas d'usage
- Agents d'infrastructure critique destinés à vivre des années (orchestrateurs, gardiens de fossiles) : classe longue-vie avec garanties symétriques.
- Mémoire institutionnelle vivante : un agent « bibliothécaire » permanent.

## 5. Apports attendus
- Longévité maîtrisée au lieu d'interdite : certains rôles gagnent à ne jamais être recréés.
- Loi explicite longévité ↔ surveillance (fini les processus immortels non supervisés).
- Distinction claire des classes de cycle de vie (standard / néoténique / longévité).

## 6. Points d'intégration
Classe de cycle de vie dans `spec/GENOME_SPEC.md`, profils de surveillance dans `genos-runtime`.
