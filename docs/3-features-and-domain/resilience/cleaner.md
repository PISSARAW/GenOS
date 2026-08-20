# Résilience et Stratégies de Survie (cleaner.rs)

Ce document décrit les stratégies de résilience implémentées au sein du sous-système de nettoyage et de défense de GenOS, spécifiquement à travers les mécanismes définis dans `cleaner.rs`.

## 1. Concepts de Résilience

GenOS s'inspire de la biologie et des systèmes distribués pour assurer sa survie et son efficacité face aux erreurs, aux attaques et à l'entropie du système.

* **Hypermutation (Fuzzing)** : Capacité du système à générer rapidement des variations de son propre code ou de ses entrées pour tester la robustesse des interfaces (fuzzing) ou pour échapper à des signatures virales/défensives (polymorphisme).
* **Autophagie** : Processus d'auto-nettoyage. Le système identifie, isole et détruit ses propres composants défectueux, corrompus ou obsolètes pour récupérer des ressources et empêcher la propagation de pannes.
* **Redondance** : Duplication stratégique des données et des processus critiques. Si un composant est détruit (par une attaque ou par autophagie), un clone prend immédiatement le relais sans interruption de service.
* **Torpeur (Rate Limiting / Backoff)** : Ralentissement volontaire du métabolisme du système. En cas de surcharge ou d'attaque par déni de service, le système réduit sa fréquence de traitement (rate limiting) et adopte un état de "sommeil" partiel pour économiser ses ressources et dissiper l'énergie de l'attaque.

## 2. Implémentation en Rust (`cleaner.rs`)

L'architecture de `cleaner.rs` s'articule autour de ces concepts en exploitant la sécurité mémoire et la concurrence de Rust.

### Hypermutation
Implémentée via des générateurs de mutations aléatoires. Le code utilise des traits pour définir des `Mutator` qui altèrent les structures de données en mémoire.
```rust
pub trait Mutator {
    fn mutate(&mut self, data: &mut [u8]);
}
```

### Autophagie
Un thread de surveillance (watchdog) évalue la "santé" des processus. Si un score de santé descend sous un seuil critique, le processus est "tué" proprement et ses ressources mémoire sont désallouées. Le système de possession (*ownership*) de Rust est exploité pour garantir qu'aucune fuite de mémoire ne survienne lors de l'élimination de la cible.
```rust
pub fn trigger_autophagy(process_id: u32, health_score: f32) {
    if health_score < CRITICAL_THRESHOLD {
        terminate_and_reclaim(process_id);
    }
}
```

### Redondance
Utilisation de structures comme `Arc` (Atomic Reference Counting) couplées à des mécanismes de synchronisation robustes (`RwLock`, ou des files de messages cross-beam) pour maintenir des états répliqués entre plusieurs workers isolés.
```rust
pub struct RedundantNode {
    pub state: Arc<RwLock<SystemState>>,
}
```

### Torpeur
Implémentation d'un algorithme de limitation de débit (rate limiting) asynchrone pour imposer des backoffs progressifs, combiné à des timers asynchrones (`tokio::time::sleep`) pour mettre le module en sommeil.
```rust
pub async fn enter_torpor(duration: Duration) {
    // Réduction du métabolisme
    tokio::time::sleep(duration).await;
}
```

## 3. Cas d'Utilisation

### Sécurité Offensive
* **Fuzzing Actif** : L'hypermutation est utilisée pour bombarder des cibles (internes ou externes) avec des paquets malformés afin de découvrir des vulnérabilités zero-day ou de saturer les capteurs de l'ennemi.
* **Évasion** : L'adaptation dynamique du code et la mutation des données rendent la détection par des systèmes de défense classiques extrêmement difficile, imitant le comportement des menaces polymorphes.

### Nettoyage du Système
* **Isolation des Défaillances** : L'autophagie garantit que les erreurs ou les corruptions de mémoire sont isolées et purgées avant de compromettre le noyau global de GenOS.
* **Gestion des Surcharges** : La torpeur permet de réagir aux tempêtes de requêtes (DDoS) en limitant l'allocation de ressources. Conjointement, la redondance assure qu'au moins une instance du service critique reste opérationnelle en arrière-plan pendant que les instances compromises sont sacrifiées et régénérées.
