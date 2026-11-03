# Missions LLM natives sous les sept protocoles

**Statut** : Accepté pour le portage du parcours textuel natif
**Date** : 2026-11-03
**Domaine** : Runtime Rust, inférence, contrats d'artefacts et preuves
**Décideurs** : Mainteneurs GenOS
**Lié à** : [Socle natif Rust](2026-11-02-protocoles-runtime-rust.md)

## Contexte

Le premier parcours natif vérifie `integer_sum` dans trois processus. Son
contrat, ses contextes et ses reçus comparent des résultats arithmétiques
identiques. Une réponse textuelle de modèle ne peut pas reprendre cette
signification. Le transport LLM historique retourne une chaîne, peut utiliser
un cache ou une simulation et perd les métriques d'usage du fournisseur.

## Décision

Installer un parcours LLM natif dans le CLI `--executor rust`. La configuration,
les messages, les documents explicitement sélectionnés, le fournisseur, le
modèle, le contrat et les budgets sont admis et liés à un binding durable.
L'inférence HTTP s'exécute dans Rust et consomme le contexte SYNAPSE réellement
relu. Elle n'utilise ni pont Node ni réponse de secours simulée.

Une observation opaque conserve l'identité de la requête effective, la réponse
du fournisseur, la fin de génération et les métriques effectivement reçues.
Le fournisseur configuré reste une autorité de confiance opérateur pour ces
métriques ; un texte déclarant son coût n'est pas une mesure. L'absence de
métrique laisse l'exposition inconnue. Un dépassement observé reste consommé.

Deux méthodes Rust installées vérifient le contrat textuel explicite. Elles ne
sont pas des juges LLM et ne certifient pas la vérité générale du texte. Une
obligation sémantique sans méthode adéquate reste non résolue et bloque la
complétion vérifiée. Un candidat et ses coûts peuvent être conservés après un
refus. Aucune publication ne donne une autorité de déploiement ou d'exécution
des instructions produites.

OMEGA inscrit l'intention, CONTINUITY le verrou d'effet et ALLOSTASIE
l'exposition dans une même transaction avant l'envoi. Une issue inconnue
interdit une relance automatique. GQWF Exchange publie les objets rehashés,
le reçu d'émission et le statut de mission dans une même transaction, après
revalidation EVIDENCE de la version courante. MORPH installe les identités des
rôles réellement utilisés ; ce profil ne revendique pas trois processus de
modèles indépendants ni un quorum distant.

## Points de livraison

1. Contrats de mission, sources textuelles et admission durable.
2. Transport LLM Rust explicite et observations d'usage authentiques.
3. CONTINUITY et MORPH appliqués aux rôles et reprises LLM.
4. SYNAPSE textuel appliqué puis consommé avant l'inférence et les vérifications.
5. ALLOSTASIE : tokens, appels et temps, réserve et inconnus conservés.
6. OMEGA : intention avant HTTP, observation et absence de redispatch inconnu.
7. EVIDENCE : obligations réelles du contrat, contexte courant et portée exacte.
8. GQWF Exchange : transfert CAS et publication atomique du texte vérifié.
9. Exécuteur et CLI de mission LLM sans repli Node.
10. Qualification adversariale, reprise et inférence locale avec un vrai modèle.

Les commits suivent les dépendances de ces points. Le profil `integer_sum`
reste disponible avec son contrat propre.

## Conséquences

La sortie générée et le contrat structurel vérifié portent des statuts
distincts. Le contrat ne transforme pas une consigne libre en vérité prouvée.
Les échecs, les réponses tronquées, les refus et les usages inconnus ne sont
pas convertis en succès. Les documents privés de runtime, Git et les fichiers
d'environnement ne sont pas des sources implicites du modèle.

Les workspaces et le stockage locaux restent de confiance opérateur. Le
profil ne crée pas un service multi-tenant authentifié. Il ne lance ni shell,
ni commande choisie par le modèle, ni outil libre hors de la méthode installée.

## Alternatives

- Réutiliser le retour `String` historique : rejeté, il perd les observations.
- Accepter un consensus de critiques LLM comme preuve : rejeté.
- Remplacer le contrat arithmétique par une chaîne : rejeté, il changerait la
  signification des preuves déjà installées.
