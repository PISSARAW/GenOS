fn lit_value(lit: i32, assign: &[i32]) -> Option<bool> {
    let idx = lit.unsigned_abs() as usize;
    match assign.get(idx).copied().unwrap_or(0) {
        0 => None,
        a => Some((lit > 0) == (a > 0)),
    }
}

fn clause_status(clause: &[i32], assign: &[i32]) -> (bool, Vec<i32>) {
    let mut unassigned = Vec::new();
    for lit in clause {
        match lit_value(*lit, assign) {
            Some(true) => return (true, Vec::new()),
            Some(false) => {},
            None => unassigned.push(*lit),
        }
    }
    (false, unassigned)
}

fn scan_clauses(clauses: &[Vec<i32>], assign: &[i32]) -> Option<Option<i32>> {
    let mut unit: Option<i32> = None;
    for clause in clauses {
        let (sat, unassigned) = clause_status(clause, assign);
        match sat {
            true => {},
            false => match unassigned.is_empty() {
                true => return None,
                false => match unassigned.len() == 1 {
                    true => unit = Some(unassigned[0]),
                    false => {},
                },
            },
        }
    }
    Some(unit)
}

fn model_complete(clauses: &[Vec<i32>], assign: &[i32]) -> bool {
    for clause in clauses {
        let mut ok = false;
        for lit in clause {
            match lit_value(*lit, assign) {
                Some(true) => {
                    ok = true;
                    break;
                }
                _ => {},
            }
        }
        match ok {
            true => {},
            false => return false,
        }
    }
    true
}

fn try_unit(clauses: &[Vec<i32>], assign: &mut [i32], lit: i32) -> bool {
    let idx = lit.unsigned_abs() as usize;
    let save = assign[idx];
    assign[idx] = match lit > 0 {
        true => 1,
        false => -1,
    };
    match dpll(clauses, assign) {
        true => true,
        false => {
            assign[idx] = save;
            false
        }
    }
}

fn first_free_var(assign: &[i32]) -> Option<usize> {
    for (i, a) in assign.iter().enumerate().skip(1) {
        match *a == 0 {
            true => return Some(i),
            false => {},
        }
    }
    None
}

fn branch_var(clauses: &[Vec<i32>], assign: &mut [i32], var: usize) -> bool {
    for val in [1, -1] {
        assign[var] = val;
        match dpll(clauses, assign) {
            true => return true,
            false => {},
        }
        assign[var] = 0;
    }
    false
}

pub fn dpll(clauses: &[Vec<i32>], assign: &mut [i32]) -> bool {
    let unit = match scan_clauses(clauses, assign) {
        None => return false,
        Some(u) => u,
    };
    match model_complete(clauses, assign) {
        true => return true,
        false => {},
    }
    match unit {
        Some(lit) => return try_unit(clauses, assign, lit),
        None => {},
    }
    match first_free_var(assign) {
        None => false,
        Some(var) => branch_var(clauses, assign, var),
    }
}

