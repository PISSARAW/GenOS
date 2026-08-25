# 26. PROCÉDURALISATION CÉRÉBELLEUSE

Comment GenOS décharge le LLM (le Cortex) en transférant les tâches vers des scripts rapides et déterministes (le Cervelet).

---

## 26.1 Automatisation des Réflexes

### Ce que ça apporte à l'agent
Chez l'humain, apprendre à faire du vélo demande beaucoup de réflexion (Cortex). Une fois acquis, c'est le Cervelet qui gère, sans y penser.
Dans GenOS, si un Agent LLM accomplit la même tâche plusieurs fois (ex: extraire un ID précis d'un log complexe), GenOS compile ce raisonnement en une fonction Rust/Python déterministe (Procéduralisation).
Cela apporte **l'effondrement des coûts d'inférence**. Ce qui coûtait 2000 tokens et 3 secondes de LLM devient un réflexe algorithmique qui coûte 0 token et 1 milliseconde.

### Schéma Conceptuel
`mermaid
flowchart LR
    Task(Nouvelle Tâche) --> LLM[Raisonnement LLM\nCortex (Lent, Cher)]
    LLM --> Repet{Répétition > Seuil ?}
    Repet -->|Oui| Cereb[Procéduralisation\n(Génération d'un script)]
    Cereb --> Reflexe[Exécution par Script\nCervelet (Rapide, Gratuit)]
    Task -.-> Reflexe
`

### Exemple Comparatif : Trier des centaines de fichiers par date
| Type d'Agent | Traitement | Coût / Vitesse |
|---|---|---|
| **Agent Simple / Expert** | Le LLM lit chaque fichier, raisonne sur la date, et fait l'action. | Très cher, très lent. Risque d'hallucination à force de fatigue. |
| **Worker GenOS** | Le LLM fait l'effort 3 fois. Le système détecte le motif. GenOS génère un script de tri (le cervelet prend le relais). | Le reste des fichiers est traité instantanément. Le LLM est libéré pour une tâche plus intelligente. |
