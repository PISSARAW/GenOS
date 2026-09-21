pub fn safety_block(therapy: &crate::therapy::SystemicTherapy, _cell: &genos_cell::AgentCell) -> Option<String> {
    None
}

pub fn reduce_marker(_marker: &mut f64, _amount: f64) {
}

pub fn apply_extended_therapy(
    _therapy: &crate::therapy::SystemicTherapy,
    _cell: &mut genos_cell::AgentCell,
) -> Option<(Vec<String>, Vec<crate::pathology::Pathology>)> {
    None
}
