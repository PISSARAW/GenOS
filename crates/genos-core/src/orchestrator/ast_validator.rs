use syn::{visit::Visit, ItemFn};
use std::fs;

struct RuleVisitor {
    pub violations: Vec<String>,
}

impl<'ast> Visit<'ast> for RuleVisitor {
    fn visit_item_fn(&mut self, i: &'ast ItemFn) {
        let arg_count = i.sig.inputs.len();
        if arg_count > 3 {
            let fn_name = &i.sig.ident;
            self.violations.push(format!(
                "AST Error: Function '{}' has {} parameters (max 3 allowed).",
                fn_name, arg_count
            ));
        }
        syn::visit::visit_item_fn(self, i);
    }
}

pub fn validate_rust_file(path: &std::path::Path) -> Result<(), String> {
    let content = fs::read_to_string(path).map_err(|e| format!("Read Error: {}", e))?;
    let syntax_tree = syn::parse_file(&content).map_err(|e| format!("Syntax Error: {}", e))?;

    let mut visitor = RuleVisitor { violations: Vec::new() };
    visitor.visit_file(&syntax_tree);

    if visitor.violations.is_empty() {
        Ok(())
    } else {
        Err(visitor.violations.join("\n"))
    }
}
