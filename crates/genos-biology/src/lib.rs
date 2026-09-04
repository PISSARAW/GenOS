pub fn add(left: u64, right: u64) -> u64 {
    left + right
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        let result = add(2, 2);
        assert_eq!(result, 4);
    }
}
pub mod neurobiology;
pub mod ecology;
pub mod signaling;
pub mod spore;
pub mod embryology;
pub mod tissue;
pub mod redundancy;
pub mod therapy;
pub mod bioluminescence;
