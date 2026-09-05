pub use genos_cell as cell;
pub use genos_genome as genome;

pub mod bioluminescence;
pub mod ecology;
pub mod embryology;
pub mod glial;
pub mod neurobiology;
pub mod phenotype;
pub mod redundancy;
pub mod signaling;
pub mod spore;
pub mod therapy;
pub mod tissue;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_modules_presence() {
        assert_eq!(therapy::Therapy::TargetedTherapy as usize, 0);
    }
}
