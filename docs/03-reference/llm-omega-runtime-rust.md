# OMEGA pour les artefacts LLM natifs

Le parcours textuel Rust utilise un appel HTTP natif installé, suivi de deux
vérifications locales du contrat textuel. Il ne convertit pas le résultat en
somme d'entiers et n'exige pas que trois modèles produisent le même texte.
Les identités de producteur et de vérificateurs proviennent de la roster MORPH
et des méthodes installées ; les vérificateurs sont des fonctions Rust du host,
pas deux enfants supplémentaires ou deux autorités de vérité.

`record_source` conserve les octets canoniques du bundle réellement admis.
Avant `begin`, les messages, la source, la politique, le modèle et les paramètres
sont liés à l'ADMIT durable et au contexte SYNAPSE. OMEGA relit aussi la tête CAS
courante et ses octets : un contexte préparé sur une autre base ne peut pas
déclencher un appel payant en utilisant ses anciennes vérifications.

`begin` inscrit dans une même transaction l'intention OMEGA, l'exposition
ALLOSTASIE et l'intention d'effet CONTINUITY. Seul un premier appel reçoit un
`DispatchPermit` opaque, non clonable et non désérialisable. Le dispatch consomme
ce permis durable avant d'entrer dans le client HTTP. Un rejeu ne confère pas
une nouvelle permission d'inférence, même si le prompt est identique.

Le client natif retourne une observation opaque ou un échec typé. Le wrapper
OMEGA persiste son propre retour exact avant de le rendre au moteur : identité,
requête, genre du retour, reçu natif et empreinte du scellement. `observe` et
`record_failure` exigent ce reçu effectivement émis. Un autre appel au client,
annulé avant son dispatch mais partageant le même hash de requête, ne peut donc
pas rembourser une ancienne opération d'issue inconnue.

`observe` conserve atomiquement la réponse authentique, les compteurs d'usage
et le résultat d'effet. Les octets HTTP bruts sont présents dans le reçu natif ;
leur empreinte est vérifiée lors des relectures. Cette provenance démontre
l'échange avec le fournisseur configuré. Elle ne certifie pas la vérité du
texte ni, pour un endpoint local, une preuve cryptographique d'exécution des
poids d'un modèle particulier.

La qualification EVIDENCE examine le contrat structurel installé sur le texte
exact et les contextes courants. Une exigence sémantique non résolue interdit
l'acceptation et la publication qualifiée. Un verdict « PASS » écrit par le
modèle ne constitue pas une preuve supplémentaire.

`EMIT` est préparé après admission des preuves. Son reçu est committé avec la
tête GQWF, le reçu de publication et le statut SQL de mission terminée. Le reçu
conserve `semantic_truth_verified: false`, `promotable: false` et
`external_effects_authorized: false` : terminer la livraison d'un artefact sous
son contrat structurel n'autorise aucune action métier externe.

Une observation déjà durable peut être requalifiée puis publiée sans HTTP
supplémentaire. Une issue restée inconnue n'est jamais redispatchée aveuglément.
Ce profil n'annonce ni idempotence du fournisseur ni réconciliation distante
automatique. Les tests `llm_omega` utilisent de véritables échanges HTTP avec
un serveur local de qualification, explicitement distinct d'un modèle réel.
