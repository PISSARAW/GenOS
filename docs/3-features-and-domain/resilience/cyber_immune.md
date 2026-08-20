# Système Cyber-Immunitaire de GenOS

Ce document détaille les stratégies de résilience et de cyber-immunité implémentées dans le projet GenOS. L'objectif de ces mécanismes est de garantir la survie, l'isolation des menaces et la récupération automatique du système face aux attaques et aux défaillances.

## 1. Concepts de Défense

### Autotomie (Honeypot)
Inspirée par la biologie (comme un lézard se séparant de sa queue), l'autotomie permet au système de sacrifier délibérément une partie de son infrastructure (comme un composant non critique ou un honeypot) lorsqu'une compromission est détectée. Cela isole l'attaquant et protège les modules critiques.

### Gossip Protocol (Protocole de Commérage)
Un mécanisme de communication décentralisé de type *peer-to-peer* utilisé pour propager rapidement l'information concernant une menace ou une anomalie à travers tous les nœuds du système. Cela permet une mise en quarantaine systémique rapide sans point de défaillance central.

### Régénération
La capacité d'auto-réparation du système. Une fois qu'un module a été isolé (via autotomie) ou qu'il a planté, le système de régénération réalloue les ressources et lance une nouvelle instance saine du module compromis à partir d'un état sécurisé connu.

### Circuit Breaker (Disjoncteur)
Un patron de conception qui empêche le système de s'épuiser à essayer d'exécuter une action vouée à l'échec (comme communiquer avec une base de données sous attaque DDoS). Il surveille les échecs et "ouvre" le circuit pour bloquer le trafic temporairement, avant de tester si le service est de nouveau opérationnel (état "Half-Open").

## 2. Implémentation dans `cyber_immune.rs`

Les mécanismes mentionnés sont codés en Rust dans le fichier `cyber_immune.rs` afin de bénéficier des garanties de sécurité mémoire et de concurrence. 

### Structure de l'Autotomie
L'autotomie est implémentée via un gestionnaire de quarantaine qui peut désactiver des modules en modifiant dynamiquement leurs droits d'accès et en redirigeant le flux réseau vers des *honeypots* :
```rust
pub struct AutotomyManager {
    compromised_nodes: Mutex<HashSet<NodeId>>,
    honeypot_router: HoneypotRouter,
}

impl AutotomyManager {
    pub fn sacrifice_and_isolate(&self, node_id: NodeId) -> Result<(), Error> {
        // Redirection du trafic vers un Honeypot
        self.honeypot_router.redirect_traffic(node_id);
        self.compromised_nodes.lock().unwrap().insert(node_id);
        Ok(())
    }
}
```

### Gossip Protocol
L'implémentation utilise `tokio` pour la concurrence asynchrone, propageant les messages d'alerte sous forme d'événements à travers les nœuds :
```rust
pub async fn broadcast_threat(threat_info: ThreatInfo, peers: Vec<Peer>) {
    for peer in peers {
        tokio::spawn(async move {
            let _ = peer.send_alert(threat_info.clone()).await;
        });
    }
}
```

### Circuit Breaker
Le disjoncteur repose sur une machine à états (Closed, Open, Half-Open) protégée par un `RwLock` pour des performances optimales en lecture :
```rust
pub enum CircuitState {
    Closed,
    Open(Instant),
    HalfOpen,
}

pub struct CircuitBreaker {
    state: RwLock<CircuitState>,
    failure_threshold: u32,
}
```

### Régénération
La régénération orchestre le cycle de vie, tuant le processus corrompu et instanciant un nouveau thread ou conteneur :
```rust
pub fn regenerate_module(module_id: ModuleId) -> Result<ModuleHandle, Error> {
    clean_corrupted_state(module_id);
    let new_instance = SystemOrchestrator::spawn_module(module_id)?;
    Ok(new_instance)
}
```

## 3. Cas d'Utilisation en Cyber-Défense

- **Défense Active contre DDoS** : Si un service spécifique est ciblé par une attaque de déni de service, le *Circuit Breaker* s'ouvre pour protéger la base de données sous-jacente. Simultanément, l'autotomie isole le service et redirige les attaquants vers un environnement stérile (*honeypot*).
- **Propagation de Signatures Malveillantes** : Lorsqu'un nœud détecte un comportement anormal (ex: tentative de ransomware), le *Gossip Protocol* informe instantanément le reste du cluster, permettant aux autres nœuds d'adapter leurs règles de filtrage.
- **Continuité de Service (Self-Healing)** : Une fois l'attaquant enlisé dans le *honeypot*, le système de *Régénération* redéploie le service affecté sur une autre plage IP ou port sécurisé, assurant un temps d'arrêt quasi nul.
