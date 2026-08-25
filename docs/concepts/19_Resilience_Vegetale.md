# 19. RÉSILIENCE CELLULAIRE & VÉGÉTALE

GenOS s'inspire des organismes les plus résistants sur Terre pour assurer la continuité de service.

---

## 19.1 Cryptobiose (Tardigrades) et Autotomie (Lézards)

### Ce que ça apporte à l'agent
- **Cryptobiose** : Un agent en attente de réponse (ex: une longue requête web) peut entrer en état de "Spore" (CryptobioticSpore). Son état mémoire est compressé (zstd) et signé (Merkle SHA-256). Il consomme "zéro token" et "zéro RAM" jusqu'à sa "réhydratation".
- **Autotomie** : Comme le lézard qui sacrifie sa queue, un agent peut sacrifier un sous-module (un honeypot) pour protéger son cœur de fonctionnement (core_safe).

Cela apporte une **scalabilité asynchrone massive** (la cryptobiose) et une **sécurité par le sacrifice** (l'autotomie).

---

## 19.2 Compartimentation de Shigo (CODIT)

### Ce que ça apporte à l'agent
Chez les arbres, lorsqu'une branche pourrit, le bois environnant crée une barrière chimique (CODIT) pour empêcher la pourriture de se répandre au tronc.
Dans GenOS, l'exécution est contenue dans une Sandbox. Si un agent casse un environnement, les dommages ne se propagent pas au système hôte ni aux autres agents. 

