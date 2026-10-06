//! Imports Rust via AST; imports JS/TS statiques via tokens hors commentaires.
use syn::visit::Visit;

pub(crate) fn imports(text: &str, rust: bool) -> Result<Vec<String>, String> {
    if rust {
        let syntax = syn::parse_file(text).map_err(|error| error.to_string())?;
        let mut visitor = RustImports::default();
        visitor.visit_file(&syntax);
        Ok(visitor.paths)
    } else {
        Ok(js_imports(&tokens(text)))
    }
}
#[derive(Default)]
struct RustImports {
    paths: Vec<String>,
}
impl<'ast> Visit<'ast> for RustImports {
    fn visit_item_use(&mut self, item: &'ast syn::ItemUse) {
        flatten_use(&item.tree, "", &mut self.paths);
    }
    fn visit_item_mod(&mut self, item: &'ast syn::ItemMod) {
        if item.content.is_none() {
            let explicit = item.attrs.iter().find_map(|attr| {
                if !attr.path().is_ident("path") {
                    return None;
                }
                let syn::Meta::NameValue(value) = &attr.meta else {
                    return None;
                };
                let syn::Expr::Lit(literal) = &value.value else {
                    return None;
                };
                let syn::Lit::Str(path) = &literal.lit else {
                    return None;
                };
                Some(format!("path:{}", path.value()))
            });
            self.paths
                .push(explicit.unwrap_or_else(|| format!("module::{}", item.ident)));
        }
        syn::visit::visit_item_mod(self, item);
    }
}
fn flatten_use(tree: &syn::UseTree, prefix: &str, paths: &mut Vec<String>) {
    match tree {
        syn::UseTree::Path(path) => {
            flatten_use(&path.tree, &join(prefix, &path.ident.to_string()), paths)
        }
        syn::UseTree::Name(name) => paths.push(join(prefix, &name.ident.to_string())),
        syn::UseTree::Rename(rename) => paths.push(join(prefix, &rename.ident.to_string())),
        syn::UseTree::Glob(_) => paths.push(prefix.to_string()),
        syn::UseTree::Group(group) => {
            for item in &group.items {
                flatten_use(item, prefix, paths);
            }
        }
    }
}
fn join(prefix: &str, part: &str) -> String {
    if prefix.is_empty() {
        part.to_string()
    } else {
        format!("{prefix}::{part}")
    }
}
#[derive(Debug)]
enum Token {
    Word(String),
    Literal(String),
    Symbol(char),
}
fn tokens(text: &str) -> Vec<Token> {
    let mut chars = text.chars().peekable();
    let mut result = Vec::new();
    while let Some(ch) = chars.next() {
        if ch == '/' && matches!(chars.peek(), Some('/' | '*')) {
            skip_comment(&mut chars);
        } else if matches!(ch, '\'' | '"' | '`') {
            result.push(Token::Literal(read_string(&mut chars, ch)));
        } else if word_character(ch) {
            let mut word = String::from(ch);
            while chars.peek().is_some_and(|next| word_character(*next)) {
                word.push(chars.next().unwrap());
            }
            result.push(Token::Word(word));
        } else if !ch.is_whitespace() {
            result.push(Token::Symbol(ch));
        }
    }
    result
}
type Characters<'a> = std::iter::Peekable<std::str::Chars<'a>>;
fn skip_comment(chars: &mut Characters<'_>) {
    let kind = chars.next();
    while let Some(ch) = chars.next() {
        if kind == Some('/') && ch == '\n' {
            break;
        }
        if kind == Some('*') && ch == '*' && chars.peek() == Some(&'/') {
            chars.next();
            break;
        }
    }
}
fn read_string(chars: &mut Characters<'_>, quote: char) -> String {
    let mut value = String::new();
    while let Some(ch) = chars.next() {
        if ch == quote {
            break;
        }
        if ch == '\\' {
            if let Some(next) = chars.next() {
                value.push(next);
            }
        } else {
            value.push(ch);
        }
    }
    // Les templates interpolés ne constituent pas une cible statique.
    if quote == '`' && value.contains("${") {
        String::new()
    } else {
        value
    }
}
fn js_imports(tokens: &[Token]) -> Vec<String> {
    let mut result = Vec::new();
    for (index, token) in tokens.iter().enumerate() {
        let Token::Word(word) = token else {
            continue;
        };
        let offset = match (word.as_str(), tokens.get(index + 1)) {
            ("from" | "import", Some(Token::Literal(_))) => 1,
            ("import" | "require", Some(Token::Symbol('('))) => 2,
            _ => continue,
        };
        if let Some(Token::Literal(path)) = tokens.get(index + offset) {
            if !path.is_empty() {
                result.push(path.clone());
            }
        }
    }
    result
}

fn word_character(ch: char) -> bool {
    ch.is_alphanumeric() || matches!(ch, '_' | '$')
}
