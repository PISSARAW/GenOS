# ADR 0790 — Morphogenèse automatique guidée par les observations

- **Statut** : Accepté pour quatre familles de workers et un remplacement en attente
- **Date** : 2026-11-04
- **Domaine** : A-Team, sélection dynamique, ressources, protocoles et preuves
- **Décideurs** : équipe GenOS
- **Lié à** : [ADR 0789](0789-morphogenese-live-des-equipes-a-team.md), [qualification réelle](../06-qualite-preuves/qualification-morphogenese-automatique-sept-protocoles-2026-11-04.md)

## Contexte

L'ADR 0789 réalise un remplacement natif, mais sa politique V1 impose des
sélecteurs et un rôle créatifs à la formation. Elle ne contient aucun titre de
mission particulier ; elle n'est pourtant ni générale par famille ni automatique
dans le choix du membre. La preuve sur un scénario ne suffit pas à démontrer
une adaptation sur d'autres travaux.

Les revues GQEL consomment aussi des ressources chez les producteurs non
créatifs. Leurs plafonds ordinaires de 8 000 ou 20 000 jetons ne permettent pas
nécessairement d'exécuter un contrat de qualité explicitement doté d'un budget.
Enfin, le payload de délégation perd l'option GQWF du parent : un appelant peut
croire l'avoir activée sans obtenir une session native de workspace.

## Décision

Une politique V2 explicite observe le graphe persisté. Elle ne contient ni nom
de mission, ni identifiant de membre, ni rôle de remplacement imposé :

```json
{
  "morphogenesis": true,
  "adaptiveMorphogenesis": {
    "version": 2,
    "mode": "automatic",
    "budgetPressureRatio": 0.5
  }
}
```

Le runtime examine les dépendances entre producteurs et consommateurs
éligibles. Il choisit un consommateur encore en attente après une observation
authentifiée de son producteur terminé. Deux observations sont prises en charge :
réparations réellement enregistrées dans les versions GQEL, ou consommation
mesurée atteignant le seuil optionnel du budget GQEL. Ce dernier signal est une
observation de ressources, jamais un défaut de qualité inventé. Le seuil est
figé à la formation, entre 0,1 et 0,95 ; aucune estimation d'usage incomplète ne
peut le déclencher.

Les familles admises sont `creative_worker`, `bounded_worker`, `specialist` et
`synthesis_worker`. Les producteurs éligibles reçoivent le contrat GQEL collectif
avant leur persistance. Le candidat n'est créé qu'après sélection. Il conserve
le type, le rôle, la niche, la tâche, les droits et les obligations du consommateur.
Le contexte ajouté transmet les observations et invite à éviter le travail
redondant ; aucune efficacité supérieure n'est présumée démontrée.

La sélection et ses observations sont liées au plan compact autorisé par Rust.
Les contrôles natifs de l'ADR 0789 restent requis : quiescence, lease de runner,
source courante, tenant, snapshot, hystérésis, MORPH, commit atomique AgentGit,
handoffs renouvelés et nouvelle exécution du remplaçant. La sélection ne peut
pas remplacer un acteur actif. Une sélection interrompue avant réservation peut
reprendre sans choisir arbitrairement un autre acteur.

Sans observation déclenchante, le moteur ne change pas le roster. L'option
`requireTransition: true` est réservée aux qualifications qui doivent prouver un
changement ; elle refuse une clôture sans transition vérifiée. Une mission sans
cette exigence peut réussir avec son équipe initiale.

Les trois familles textuelles supplémentaires ont un plafond de qualité à
160 000 jetons, utilisé seulement avec contrat GQEL et allocation explicite.
Le minimum entre allocation, budget GQEL et plafond reste appliqué et scellé.
Les plafonds ordinaires et les portes de preuve ne sont pas augmentés.

La délégation immédiate et le scheduler différé transmettent désormais les
seuls paramètres de workspace GQWF reconnus, ainsi qu'un refus explicite
d'écriture. Ils ne recopient pas une politique d'exécution arbitraire pouvant
élargir les droits. Un domaine GQEL explicitement `generic` conserve le profil
prose, même si son brief interdit un scénario avec ce mot.

## Vérification des protocoles

La qualification indépendante exige les sept mécanismes de mission : EVIDENCE,
CONTINUITY, MORPH, OMEGA, GQWF, SYNAPSE et ALLOSTASIS. MORPH est le protocole
transactionnel de la morphogenèse, inclus dans ce décompte de sept.
Le vérificateur inspecte leurs états, événements, reçus et empreintes persistés,
les preuves natives terminées, le roster et les octets de la livraison signée.
Il refuse un protocole manquant ; une sonde masque GQWF sans modifier la base
opérationnelle et vérifie ce refus.

GQWF reste un profil explicite du workspace. Pour les missions en lecture seule
qualifiées ici, la preuve couvre échange CAS de la base et du candidat,
vérification des mondes reçus et libération de session. Elle ne revendique ni
publication d'un correctif de code ni exécution d'un nouveau programme source.

## Conséquences et alternatives

Deux missions réelles, logistique et planning, ont réalisé la sélection V2,
la transition native, l'exécution du remplaçant et la clôture acceptée. Les
tests natifs couvrent aussi les quatre familles, les sélecteurs absents, le
graphe permuté, l'absence de signal, la pression mesurée sans défaut inventé,
les rôles altérés et les plafonds forgés. Le dossier lié conserve les preuves.

Une configuration universelle activée silencieusement est rejetée. Les types
déterministes, les missions sans dépendance éligible, la préemption d'une
inférence et la réorganisation arbitraire restent hors de ce profil. Les autres
formes de morphogenèse ne deviennent pas prouvées par ces deux expériences.
