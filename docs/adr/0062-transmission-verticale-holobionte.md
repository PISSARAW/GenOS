# ADR 0062 — Transmission verticale Holobionte

## Statut

Accepté — treizième lot du plan Holobionte.

## Contexte

Un Host persistant peut engendrer une nouvelle génération, mais la continuité
ne doit pas conférer automatiquement une résidence ou une autorité aux
symbiontes hérités. La constitution et le contrat déterminent ce qui peut
traverser la génération.

## Décision

1. Créer un Host enfant avec une identité distincte et une copie révisée de la
   constitution du parent.
2. Appliquer conjointement la politique constitutionnelle et la politique du
   contrat. `NEVER_INHERIT` et `REACQUIRE` empêchent l'héritage direct ; une
   contradiction avec `VERTICAL_REQUIRED` est rejetée.
3. Faire examiner la définition héritée par AEIS, puis recopier son modèle de
   contrat avec le nouvel identifiant du Host.
4. Enregistrer le symbionte comme candidat. Il doit repasser l'admission
   sandbox avant de devenir résident.
5. Journaliser le lien de génération sur le parent et l'enfant.

## Conséquences

- Seules les définitions et les modèles de contrat actifs sont transmis par
  ce lot ; les permissions ne deviennent pas une résidence implicite.
- Les procédures, l'historique des partenaires et les mémoires critiques ou
  immunitaires nécessitent un transfert explicite et validé dans un lot dédié.
- Les sessions parent et enfant restent identifiables séparément pour les
  audits et les reprises.

## Alternatives

- Réactiver directement le résident hérité : rejeté, car cela contournerait
  l'admission du nouvel Host.
- Copier intégralement l'état JSON du parent : rejeté, car les ressources,
  identifiants de session et autorisations sont propres à chaque génération.
