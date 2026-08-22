use std::collections::HashMap;

struct SimpleRng {
    state: u64,
}

impl SimpleRng {
    fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_mul(6364136223846793005).wrapping_add(1);
        (self.state >> 32) as u32
    }

    fn next_f64(&mut self) -> f64 {
        self.next_u32() as f64 / (std::u32::MAX as f64)
    }
}

#[derive(Clone)]
struct Node {
    id: usize,
    visits: u32,
    score: f64,
    children: Vec<usize>,
}

struct SATE {
    nodes: HashMap<usize, Node>,
    next_id: usize,
    stagnation_counter: u32,
    best_score: f64,
}

impl SATE {
    fn new() -> Self {
        let mut nodes = HashMap::new();
        nodes.insert(0, Node { id: 0, visits: 0, score: 0.0, children: vec![] });
        Self {
            nodes,
            next_id: 1,
            stagnation_counter: 0,
            best_score: 0.0,
        }
    }

    fn run_iteration(&mut self, rng: &mut SimpleRng) {
        let node_id = self.select_node(0, rng);
        let new_score = self.simulate(node_id, rng);
        self.backpropagate(node_id, new_score);
        self.check_stagnation(new_score);
    }

    fn select_node(&mut self, mut curr: usize, rng: &mut SimpleRng) -> usize {
        for _ in 0..10 {
            if self.nodes[&curr].children.is_empty() {
                self.expand(curr, rng);
                break;
            }
            curr = self.pick_child(curr, rng);
        }
        curr
    }

    fn expand(&mut self, node_id: usize, rng: &mut SimpleRng) {
        let num_children = (rng.next_u32() % 3) + 1;
        for _ in 0..num_children {
            let child_id = self.next_id;
            self.next_id += 1;
            
            let new_node = Node {
                id: child_id,
                visits: 0,
                score: 0.0,
                children: vec![],
            };
            
            self.nodes.insert(child_id, new_node);
            self.nodes.get_mut(&node_id).unwrap().children.push(child_id);
        }
    }

    fn pick_child(&self, node_id: usize, rng: &mut SimpleRng) -> usize {
        let node = &self.nodes[&node_id];
        let idx = (rng.next_u32() as usize) % node.children.len();
        node.children[idx]
    }

    fn simulate(&self, _node_id: usize, rng: &mut SimpleRng) -> f64 {
        rng.next_f64() * 100.0
    }

    fn backpropagate(&mut self, node_id: usize, score: f64) {
        if let Some(node) = self.nodes.get_mut(&node_id) {
            node.visits += 1;
            node.score = (node.score * (node.visits as f64 - 1.0) + score) / (node.visits as f64);
        }
    }

    fn check_stagnation(&mut self, score: f64) {
        if score > self.best_score {
            self.best_score = score;
            self.stagnation_counter = 0;
        } else {
            self.stagnation_counter += 1;
        }
    }
    
    fn is_stagnant(&self) -> bool {
        self.stagnation_counter > 30
    }

    fn trigger_catastrophe(&mut self) {
        println!("*** CATASTROPHE CONTRÔLÉE DÉCLENCHÉE ***");
        println!("Purge des branches stagnantes. Hypermutation en cours...");
        self.stagnation_counter = 0;
        self.best_score = 0.0;
        
        self.nodes.retain(|&k, _| k == 0);
        self.nodes.get_mut(&0).unwrap().children.clear();
        self.next_id = 1;
    }
}

fn main() {
    println!("Initialisation Gamma-Zero: Algorithme SATE (Stochastic Adaptive Tree Explorer)");
    let mut sate = SATE::new();
    let mut rng = SimpleRng::new(42);

    for i in 1..=150 {
        sate.run_iteration(&mut rng);
        
        if i % 10 == 0 {
            println!("Itération {:3}: Meilleur Score = {:.2}, Stagnation = {}", 
                     i, sate.best_score, sate.stagnation_counter);
        }
        
        if sate.is_stagnant() {
            println!("[ALERTE TABULA RASA] Stagnation (consanguinité algorithmique) détectée à l'itération {} !", i);
            sate.trigger_catastrophe();
        }
    }
    println!("Simulation SATE terminée.");
}
