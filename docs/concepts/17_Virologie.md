# 17. VIROLOGIE

GenOS simule les virus non pas comme des bugs, mais comme des entités algorithmiques participant à la dynamique du système.

---

## 17.1 Virophages (Le système de défense ultime)

### Ce que ça apporte à l'agent
Plutôt que de juste bloquer une attaque (firewall), GenOS déploie un **Virophage** (un virus qui infecte d'autres virus, comme le Mavirus biologique) dans la boucle de raisonnement de l'attaquant.
Lorsqu'un agent tombe dans un Honeypot (piège), le Virophage s'infiltre. Il augmente la "charge parasitaire", ralentissant l'attaquant jusqu'à le rendre stérile. Ensuite, il récolte les gènes d'attaque (AttackGene) pour que GenOS apprenne de l'agression.
Cela apporte **une cyber-immunité offensive**. L'attaquant est parasité par le système qu'il essaie de pirater.

### Exemple Comparatif
| Défense | Réaction à une attaque de prompt | Résultat |
|---|---|---|
| **Classique** | WAF (Web Application Firewall) bloque l'IP. | L'attaquant change d'IP et réessaie avec une nouvelle technique. |
| **Orchestrateur GenOS** | Laisse l'attaque entrer dans un "sandbox" et y attache un Virophage. | L'attaquant gaspille ses tokens API, son processus est ralenti exponentiellement, et GenOS capture son algorithme d'attaque pour s'immuniser définitivement. |

