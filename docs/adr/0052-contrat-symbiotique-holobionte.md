# ADR 0052 — Contrat symbiotique Holobionte

## Statut

Accepté — troisième tranche de fondation Holobionte.

## Contexte

La session enregistre les symbiontes découverts et la constitution fixe les
limites du Host. Il manque un accord explicite, vérifiable et révocable pour
chaque relation entre un Host et un symbionte.

## Décision

1. Stocker chaque contrat dans un journal append-only, avec une révision
   distincte pour chaque changement de statut.
2. N'émettre un contrat que pour un symbionte découvert dans la session et
   après l'établissement de la constitution du Host.
3. Borner le contrat par l'identité du Host, son plafond de dépendance, sa
   politique de confidentialité et son plafond d'autorité. Les leases d'outils
   sont explicites et les jokers sont refusés.
4. Exposer un contrôle d'autorisation qui exige un contrat actif, la capacité
   demandée dans son périmètre et, si applicable, un lease d'outil.
5. Révoquer par ajout d'une nouvelle révision ; les révisions antérieures ne
   sont ni modifiées ni supprimées.

## Conséquences

- Les bornes d'une relation et son historique sont persistés et auditables.
- Le service fournit un point de contrôle réutilisable par les chemins
  d'exécution. Leur raccordement global à l'orchestrateur et au sandbox reste
  une tranche ultérieure.
- La négociation automatique, la transmission verticale et les politiques
  d'immunité exécutables restent hors de cette tranche.

## Alternatives

- Garder le périmètre uniquement dans le prompt : rejeté, car son respect ne
  serait ni vérifiable ni auditable.
- Réécrire le contrat lors d'une révocation : rejeté, car cela effacerait
  l'état précédemment accordé.
