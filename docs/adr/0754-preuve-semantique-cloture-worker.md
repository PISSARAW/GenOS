# ADR 0754 — Preuve sémantique pour qualifier un worker

Un run `completed` décrit la fin de son exécution. Un dossier sourcé peut contenir une réponse erronée. La qualification `result.verified` du receipt exige une attestation indépendante acceptée pour un domaine sémantique reconnu ; l'oracle `worker_artifact` vérifie la structure et ne suffit pas. Un replay vérifié démontre la reproductibilité, mais ne constitue pas à lui seul un oracle de vérité pour la clôture de mission.

Avant d'utiliser un dossier pour la clôture, la référence est reliée à l'événement terminal original et au hash du rapport, puis vérifiée dans le journal historique des attestations. La mission, le worker et le scope courant doivent correspondre. Toute référence absente, falsifiée ou hors scope laisse la clôture partielle.

Les runs sans cette preuve conservent leur statut d'exécution et leur dossier ; leur receipt ne les qualifie pas comme résultat vérifié. Les domaines couverts par les oracles sémantiques existants restent utilisables.

Les anciens receipts qui ne portent pas le domaine et l'acceptation de l'oracle ne sont pas considérés comme preuve sémantique. Une clôture par dossier peut toutefois vérifier l'attestation historique à nouveau.
