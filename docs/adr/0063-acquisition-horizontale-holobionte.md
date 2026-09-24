# ADR 0063 — Acquisition horizontale Holobionte

## Statut

Accepté — quatorzième lot du plan Holobionte.

## Contexte

Un Host peut découvrir des symbiontes dans des registres, archives, Rhizome,
outils externes ou un autre Host. La provenance externe ne suffit pas à
accorder une résidence ou des permissions.

## Décision

1. Exiger une source typée, une référence vérifiable, des preuves et un
   SymbiosisContract limité à la constitution du Host.
2. Interdire l’acquisition horizontale quand la constitution exige une
   transmission verticale.
3. Enregistrer le candidat puis le mettre en quarantaine avant l’examen AEIS.
4. En cas de revue autorisée, enregistrer le modèle de contrat, libérer le
   candidat avec un reçu d’immunité puis démarrer l’essai sandbox.
5. Laisser l’admission existante évaluer l’essai et seule décider de la
   résidence. Un refus AEIS conserve le candidat en quarantaine.

## Conséquences

- Les nouvelles sources suivent le même contrôle d’admission que les autres
  candidats et ne reçoivent jamais de résidence implicite.
- Le journal conserve la provenance, les transitions de quarantaine et le
  reçu AEIS associé à la libération.
- Les connecteurs Rhizome, registres de modèles et archives fournissent leurs
  découvertes au service, sans déléguer au service l’autorité du Host.

## Alternatives

- Admettre directement les éléments d’un registre de confiance : rejeté, car
  la confiance dans la source ne prouve ni la compatibilité au contrat ni
  l’innocuité pour le Host.
- Traiter l’acquisition comme une transmission verticale : rejeté, car les
  sources externes ne possèdent pas nécessairement de Host parent ni de
  lignée validée.
