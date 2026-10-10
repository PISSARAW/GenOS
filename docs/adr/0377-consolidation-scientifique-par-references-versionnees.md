# ADR 0377 — Consolider les résultats scientifiques par références versionnées

- **Statut** : Proposé ; raccordement de bout en bout non implémenté.
- **Date** : 2026-10-10.
- **Domaine** : Communication, preuves, GQWF, G-CIR.
- **Décideurs** : Maintenance GenOS, en revue.
- **Lié à** : [ADR 0369](0369-racines-gqwf-et-vues-durables.md),
  [G-CIR](../02-orchestration/g-cir.md),
  [GQWF v2](../02-orchestration/gqwf-v2.md).

## Contexte

Le Signal Plane possède une livraison durable et des récepteurs ; la politique de
communication connaît le silence, l'audience experte et le common ground par
paires. GQWF v2 fournit des racines de fichiers et des vues privées, mais une
racine ne constitue ni un résultat scientifique, ni un reçu de preuve. G-CIR
possède un registre de visibilité, tandis que les résultats formels, les
rétractations scientifiques et les dépendances mathématiques suivent encore
des chemins distincts. Leur composition à 10 000 identités logiques n'est pas
qualifiée.

La présence d'un artefact, sa livraison, sa visibilité dans une invocation et
sa validité scientifique sont quatre assertions différentes. Le hash d'un
fichier atteste des octets, pas l'énoncé que ces octets démontrent.

## Décision proposée

### Référence scientifique

Introduire un contrat immuable qui nomme l'organisation, le projet, le
workspace, le type d'objet, son identifiant et sa version, son empreinte de
contenu, l'énoncé canonique, les hypothèses, le domaine de validité, les
dépendances et l'environnement de vérification. Une racine GQWF peut être une
référence de contenu de ce contrat ; elle ne devient pas son autorité de preuve.
La résolution exige un contrôle de portée et une vérification d'intégrité.

Le statut `verified` ou `refuted` exige un reçu indépendant lié à l'énoncé
exact, à la source, à l'environnement et aux dépendances. Le constructeur d'une
enveloppe et le texte d'un modèle ne peuvent pas accorder ce statut. Une
formalisation en langage naturel vers Lean reste une hypothèse distincte à
qualifier avant de publier le résultat comme preuve de l'énoncé naturel.

### Dépendances et livraison

Persister un index inverse par objet et version, ainsi que les obligations
ouvertes des consommateurs. Une découverte vérifiée sélectionne d'abord les
consommateurs dépendants ; la recherche d'experts intervient lorsque les
dépendances ne suffisent pas. Une vue commune de garage signifie « disponible »
et ne signifie pas « vu » ou « assimilé » pour chaque agent.

L'objet, ses dépendances et son événement de publication sont inscrits avec
une outbox dans la même transaction locale. Un transport reprend les événements
non acquittés avec une clé idempotente incluant type d'événement, objet et
version. Les rétractations et invalidations ne sont jamais coalescées avec une
publication ni abandonnées parce qu'un signal récent a le même sujet. Les
effets des récepteurs exigent aussi une reprise idempotente ; une transaction
SQLite ne rend pas ces effets externes atomiques.

Une rétractation validée parcourt l'index inverse et marque les dérivés
obsolètes. Le runtime suspend les consommateurs concernés et ne réveille que
ceux dont une obligation ouverte est devenue satisfaisable ou invalide.

### Visibilité et capacité

G-CIR résout les références autorisées au moment de l'inférence, matérialise
uniquement les octets nécessaires à l'obligation encore ouverte et enregistre
leur empreinte dans le reçu de visibilité. Un objet déjà résolu par le runtime
ne déclenche aucun appel au modèle. Les réponses du modèle restent candidates.

Le nombre d'identités logiques, le nombre de capsules actives et le nombre
d'inférences simultanées sont mesurés séparément. GQWF conserve des vues privées
et matérialise un dossier physique seulement si l'outil en a besoin. Un gain
de coût ou de débit ne sera revendiqué qu'après mesure du cycle complet :
import, capture, livraison, page-in, inférence, vérification et promotion.

## Mise en œuvre et validation

1. Fermer les failles de cycle de vie des capsules, de binding des preuves et
   de livraison/coalescing avant de publier des objets scientifiques.
2. Définir le contrat de référence et le resolver soumis au contrôle de portée.
3. Persister les dépendances inverses, les obligations et l'outbox ; raccorder
   le journal de rétractation existant.
4. Brancher l'audience ciblée, puis la matérialisation G-CIR et ses reçus.
5. Comparer 100, 1 000 et 10 000 identités logiques sous une concurrence
   physique bornée. Mesurer résultats vérifiés par coût total, latence de
   propagation, messages inutiles et résultats obsolètes consommés. Injecter
   des pannes entre commit, livraison, effet récepteur et acquittement.

Chaque étape possède ses tests et son statut propre. Cet ADR proposé n'atteste
ni la réalisation du flux ni la capacité à exécuter 10 000 workers en parallèle.

## Conséquences

### Positives attendues

- Une référence vérifiée circule sans recopier systématiquement la preuve.
- Les invalidations suivent les vrais consommateurs et leurs versions.
- Les reçus séparent transport, visibilité et validité scientifique.

### Coûts et limites

- L'index inverse et l'outbox ajoutent de la persistance et des opérations de
  reprise. Leur débit et leur contention doivent être mesurés.
- La traduction d'un énoncé naturel en énoncé formel ne devient pas vraie par
  simple compilation Lean ; elle requiert sa propre assurance.
- Une racine GQWF ne capture pas Git, les dépendances de build, les processus
  ou l'ensemble de l'organisme.

## Alternatives

- Étendre le common ground à toutes les paires d'une population : écarté à
  cette échelle, car le nombre de paires croît quadratiquement.
- Diffuser toutes les découvertes : écarté ; le besoin et l'autorisation du
  destinataire doivent être établis.
- Traiter GQWF ou un `FormalResult` sérialisé comme certificat de preuve :
  écarté ; intégrité et validité sont des propriétés distinctes.
