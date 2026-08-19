// Ce fichier implémente plusieurs algorithmes d'organisation inspirés de la nature :
// - Boids (Nuées d'oiseaux)
// - FSS (Fish School Search)
// - Blob (Physarum polycephalum)
// - GWO (Grey Wolf Optimizer)

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec2 {
    pub x: f32,
    pub y: f32,
}

impl Vec2 {
    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    pub fn add(&self, other: &Vec2) -> Vec2 {
        Vec2::new(self.x + other.x, self.y + other.y)
    }

    pub fn sub(&self, other: &Vec2) -> Vec2 {
        Vec2::new(self.x - other.x, self.y - other.y)
    }

    pub fn mul(&self, scalar: f32) -> Vec2 {
        Vec2::new(self.x * scalar, self.y * scalar)
    }

    pub fn mag(&self) -> f32 {
        (self.x * self.x + self.y * self.y).sqrt()
    }

    pub fn normalize(&self) -> Vec2 {
        let m = self.mag();
        if m > 0.0 {
            self.mul(1.0 / m)
        } else {
            *self
        }
    }
}

// ==========================================
// 1. BOIDS (Nuées d'oiseaux)
// ==========================================

#[derive(Clone, Debug)]
pub struct Boid {
    pub pos: Vec2,
    pub vel: Vec2,
}

impl Boid {
    pub fn new(pos: Vec2, vel: Vec2) -> Self {
        Self { pos, vel }
    }

    pub fn apply_force(&mut self, force: &Vec2) {
        self.vel = self.vel.add(force);
    }

    pub fn update_pos(&mut self, max_speed: f32) {
        if self.vel.mag() > max_speed {
            self.vel = self.vel.normalize().mul(max_speed);
        }
        self.pos = self.pos.add(&self.vel);
    }
}

pub fn boid_separation(boid: &Boid, neighbors: &[Boid], dist: f32) -> Vec2 {
    let mut steer = Vec2::default();
    let mut count = 0;
    
    for n in neighbors {
        let d = boid.pos.sub(&n.pos).mag();
        if d > 0.0 && d < dist {
            let diff = boid.pos.sub(&n.pos).normalize().mul(1.0 / d);
            steer = steer.add(&diff);
            count += 1;
        }
    }
    
    if count > 0 {
        steer.mul(1.0 / count as f32)
    } else {
        steer
    }
}

pub fn boid_alignment(boid: &Boid, neighbors: &[Boid], dist: f32) -> Vec2 {
    let mut sum = Vec2::default();
    let mut count = 0;
    
    for n in neighbors {
        let d = boid.pos.sub(&n.pos).mag();
        if d > 0.0 && d < dist {
            sum = sum.add(&n.vel);
            count += 1;
        }
    }
    
    if count > 0 {
        sum.mul(1.0 / count as f32).normalize()
    } else {
        sum
    }
}

pub fn boid_cohesion(boid: &Boid, neighbors: &[Boid], dist: f32) -> Vec2 {
    let mut sum = Vec2::default();
    let mut count = 0;
    
    for n in neighbors {
        let d = boid.pos.sub(&n.pos).mag();
        if d > 0.0 && d < dist {
            sum = sum.add(&n.pos);
            count += 1;
        }
    }
    
    if count > 0 {
        let avg_pos = sum.mul(1.0 / count as f32);
        avg_pos.sub(&boid.pos).normalize()
    } else {
        sum
    }
}

// ==========================================
// 2. FISH SCHOOL SEARCH (FSS)
// ==========================================

#[derive(Clone, Debug)]
pub struct Fish {
    pub pos: Vec2,
    pub weight: f32,
    pub weight_delta: f32,
}

impl Fish {
    pub fn new(pos: Vec2, weight: f32) -> Self {
        Self { pos, weight, weight_delta: 0.0 }
    }

    pub fn swim(&mut self, step: &Vec2) {
        self.pos = self.pos.add(step);
    }
    
    pub fn feed(&mut self, food_val: f32) {
        self.weight_delta = food_val;
        self.weight += food_val;
    }
}

pub fn fish_barycenter(school: &[Fish]) -> Vec2 {
    let mut sum_pos = Vec2::default();
    let mut sum_weight = 0.0;
    
    for f in school {
        let w_pos = f.pos.mul(f.weight);
        sum_pos = sum_pos.add(&w_pos);
        sum_weight += f.weight;
    }
    
    if sum_weight > 0.0 {
        sum_pos.mul(1.0 / sum_weight)
    } else {
        sum_pos
    }
}

// ==========================================
// 3. BLOB (Physarum polycephalum)
// ==========================================

#[derive(Clone, Debug)]
pub struct BlobNode {
    pub pos: Vec2,
    pub food_level: f32,
}

impl BlobNode {
    pub fn new(pos: Vec2, food_level: f32) -> Self {
        Self { pos, food_level }
    }

    pub fn diffuse(&mut self, env_food: f32, rate: f32) {
        let diff = (env_food - self.food_level) * rate;
        self.food_level += diff;
    }
}

pub fn blob_attraction(node: &BlobNode, food_source: &Vec2) -> Vec2 {
    let dir = food_source.sub(&node.pos);
    dir.normalize().mul(node.food_level)
}

// ==========================================
// 4. GREY WOLF OPTIMIZER (GWO)
// ==========================================

#[derive(Clone, Debug)]
pub struct Wolf {
    pub pos: Vec2,
    pub fitness: f32,
}

impl Wolf {
    pub fn new(pos: Vec2, fitness: f32) -> Self {
        Self { pos, fitness }
    }

    pub fn update_fitness(&mut self, new_fit: f32) {
        self.fitness = new_fit;
    }
}

#[derive(Clone, Debug)]
pub struct GwoPack {
    pub alpha: Wolf,
    pub beta: Wolf,
    pub delta: Wolf,
}

pub fn calculate_wolf_step(w: &Wolf, leader: &Wolf, a: f32) -> Vec2 {
    // Calcul simplifié pour l'exemple GWO : A et C.
    let a_vec = 0.5 * a; 
    let c_vec = 1.0;     
    
    let l_pos = leader.pos;
    let w_pos = w.pos;
    
    let dist = l_pos.mul(c_vec).sub(&w_pos).mag();
    let step_mag = dist * a_vec;
    
    l_pos.sub(&w_pos).normalize().mul(step_mag)
}

pub fn update_wolf_pos(w: &mut Wolf, pack: &GwoPack, a: f32) {
    let step_alpha = calculate_wolf_step(w, &pack.alpha, a);
    let step_beta = calculate_wolf_step(w, &pack.beta, a);
    let step_delta = calculate_wolf_step(w, &pack.delta, a);
    
    let mut total_step = step_alpha.add(&step_beta).add(&step_delta);
    total_step = total_step.mul(1.0 / 3.0);
    
    w.pos = w.pos.add(&total_step);
}
