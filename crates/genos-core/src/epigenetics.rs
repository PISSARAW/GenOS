use nom::{
    branch::alt,
    bytes::complete::tag,
    character::complete::{alphanumeric1, multispace0, multispace1},
    combinator::{map, map_res, recognize},
    multi::many0,
    sequence::{delimited, tuple},
    IResult,
};
use serde::{Deserialize, Serialize};

/// Opérateurs logiques autorisés pour l'évaluation
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Operator {
    GreaterOrEqual,
    LessOrEqual,
    GreaterThan,
    LessThan,
    Equal,
    NotEqual,
}

/// L'Arbre Syntaxique Abstrait (AST) de notre moteur de règles.
/// Au lieu d'avoir un "String", on a une structure mathématique que le processeur peut évaluer formellement.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Expression {
    /// Une condition simple: "variable >= valeur"
    Condition {
        variable: String,
        operator: Operator,
        target_value: f64,
    },
    /// On anticipe l'avenir: possibilité de combiner des règles ! (Ex: "A >= 1 AND B < 2")
    And(Box<Expression>, Box<Expression>),
    Or(Box<Expression>, Box<Expression>),
}

impl Expression {
    /// Évalue l'AST en fonction d'un contexte de variables (ton `CognitiveState` ou `Metadata`)
    pub fn evaluate(&self, context: &std::collections::HashMap<String, f64>) -> bool {
        match self {
            Expression::Condition { variable, operator, target_value } => {
                let actual_value = context.get(variable).copied().unwrap_or(0.0);
                match operator {
                    Operator::GreaterOrEqual => actual_value >= *target_value,
                    Operator::LessOrEqual => actual_value <= *target_value,
                    Operator::GreaterThan => actual_value > *target_value,
                    Operator::LessThan => actual_value < *target_value,
                    Operator::Equal => (actual_value - target_value).abs() < f64::EPSILON,
                    Operator::NotEqual => (actual_value - target_value).abs() >= f64::EPSILON,
                }
            }
            Expression::And(left, right) => left.evaluate(context) && right.evaluate(context),
            Expression::Or(left, right) => left.evaluate(context) || right.evaluate(context),
        }
    }
}

/* =====================================================================
   LE PARSEUR (NOM) - Transforme la String en AST
   ===================================================================== */

// 1. Parser le nom de la variable (ex: "consecutive_failures")
fn parse_variable(input: &str) -> IResult<&str, &str> {
    recognize(many0(alt((alphanumeric1, tag("_")))))(input)
}

// 2. Parser l'opérateur (ex: ">=")
fn parse_operator(input: &str) -> IResult<&str, Operator> {
    let (input, op) = alt((
        tag(">="),
        tag("<="),
        tag("=="),
        tag("!="),
        tag(">"),
        tag("<"),
    ))(input)?;

    let operator = match op {
        ">=" => Operator::GreaterOrEqual,
        "<=" => Operator::LessOrEqual,
        "==" => Operator::Equal,
        "!=" => Operator::NotEqual,
        ">" => Operator::GreaterThan,
        "<" => Operator::LessThan,
        _ => unreachable!(),
    };
    Ok((input, operator))
}

// 3. Parser la valeur (f64)
fn parse_value(input: &str) -> IResult<&str, f64> {
    let (input, val_str) = recognize(tuple((
        nom::combinator::opt(tag("-")),
        nom::character::complete::digit1,
        nom::combinator::opt(tuple((tag("."), nom::character::complete::digit1))),
    )))(input)?;
    
    let val: f64 = val_str.parse().unwrap_or(0.0);
    Ok((input, val))
}

// 4. Parser la condition entière ("variable >= valeur") avec gestion des espaces
pub fn parse_condition(input: &str) -> IResult<&str, Expression> {
    let (input, _) = multispace0(input)?;
    let (input, variable) = parse_variable(input)?;
    let (input, _) = multispace0(input)?;
    let (input, operator) = parse_operator(input)?;
    let (input, _) = multispace0(input)?;
    let (input, value) = parse_value(input)?;
    let (input, _) = multispace0(input)?;

    Ok((
        input,
        Expression::Condition {
            variable: variable.to_string(),
            operator,
            target_value: value,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_parse_and_evaluate() {
        let (rest, ast) = parse_condition("consecutive_failures >= 3.5").unwrap();
        assert_eq!(rest, ""); // Tout a été parsé

        let mut context = HashMap::new();
        context.insert("consecutive_failures".to_string(), 4.0);
        
        // 4.0 >= 3.5 -> true
        assert!(ast.evaluate(&context));
        
        context.insert("consecutive_failures".to_string(), 2.0);
        // 2.0 >= 3.5 -> false
        assert!(!ast.evaluate(&context));
    }
}
