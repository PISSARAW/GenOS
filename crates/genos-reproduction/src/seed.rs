use rand::SeedableRng;
use rand::rngs::StdRng;

pub(crate) fn rng_from_seed(seed: &str) -> StdRng {
    let mut state = 0xcbf29ce484222325u64;
    for byte in seed.as_bytes() {
        state ^= u64::from(*byte);
        state = state.wrapping_mul(0x100000001b3);
    }
    StdRng::seed_from_u64(state)
}

pub(crate) fn default_seed(parent_a: &str, parent_b: &str) -> String {
    format!("{parent_a}:{parent_b}")
}