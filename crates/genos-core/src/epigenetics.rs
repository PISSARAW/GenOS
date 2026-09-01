use nom::{
    branch::alt,
    bytes::complete::{tag, tag_no_case},
    character::complete::{alphanumeric1, multispace0},
    combinator::recognize,
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
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Expression {
    Condition {
        variable: String,
        operator: Operator,
        target_value: f64,
    },
    And(Box<Expression>, Box<Expression>),
    Or(Box<Expression>, Box<Expression>),
    Xor(Box<Expression>, Box<Expression>),
}

impl Expression {
    /// Évalue l'AST en fonction d'un contexte de variables
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
            Expression::Xor(left, right) => left.evaluate(context) ^ right.evaluate(context),
        }
    }
}

/* =====================================================================
   LE PARSEUR (NOM)
   ===================================================================== */

fn parse_variable(input: &str) -> IResult<&str, &str> {
    recognize(many0(alt((alphanumeric1, tag("_")))))(input)
}

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

fn parse_value(input: &str) -> IResult<&str, f64> {
    let (input, val_str) = recognize(tuple((
        nom::combinator::opt(tag("-")),
        nom::character::complete::digit1,
        nom::combinator::opt(tuple((tag("."), nom::character::complete::digit1))),
    )))(input)?;
    
    let val: f64 = val_str.parse().unwrap_or(0.0);
    Ok((input, val))
}

/// Parse une condition simple: "variable >= valeur"
fn parse_condition(input: &str) -> IResult<&str, Expression> {
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

/// Parse un élément primaire (soit une condition, soit une expression entre parenthèses)
fn parse_primary(input: &str) -> IResult<&str, Expression> {
    alt((
        delimited(
            tuple((multispace0, tag("("), multispace0)),
            parse_expression,
            tuple((multispace0, tag(")"), multispace0))
        ),
        parse_condition
    ))(input)
}

/// Parse l'expression complète avec AND, OR, XOR évalués de gauche à droite
pub fn parse_expression(input: &str) -> IResult<&str, Expression> {
    let (input, mut expr) = parse_primary(input)?;
    let (input, remainder) = many0(tuple((
        delimited(
            multispace0,
            alt((tag_no_case("AND"), tag_no_case("OR"), tag_no_case("XOR"))),
            multispace0
        ),
        parse_primary
    )))(input)?;
    
    for (op, next_expr) in remainder {
        expr = match op.to_uppercase().as_str() {
            "AND" => Expression::And(Box::new(expr), Box::new(next_expr)),
            "OR" => Expression::Or(Box::new(expr), Box::new(next_expr)),
            "XOR" => Expression::Xor(Box::new(expr), Box::new(next_expr)),
            _ => unreachable!(),
        };
    }
    
    Ok((input, expr))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_complex_expressions() {
        let mut context = HashMap::new();
        context.insert("failures".to_string(), 3.0);
        context.insert("stress".to_string(), 0.8);
        context.insert("budget".to_string(), 10.0);

        // Test 1: AND
        let (_, ast) = parse_expression("failures >= 3 AND stress > 0.5").unwrap();
        assert!(ast.evaluate(&context));

        // Test 2: OR
        let (_, ast) = parse_expression("budget < 5 OR failures >= 3").unwrap();
        assert!(ast.evaluate(&context)); // true car failures >= 3

        // Test 3: XOR (Exclusive OR)
        // Vrai seulement si UNE SEULE des deux conditions est vraie.
        let (_, ast) = parse_expression("stress > 0.5 XOR failures >= 3").unwrap();
        assert!(!ast.evaluate(&context)); // false car LES DEUX sont vraies
        
        let (_, ast) = parse_expression("stress > 0.9 XOR failures >= 3").unwrap();
        assert!(ast.evaluate(&context)); // true car SEULEMENT failures est vraie

        // Test 4: Parenthèses
        let (_, ast) = parse_expression("(budget < 5 OR failures >= 3) AND stress > 0.5").unwrap();
        assert!(ast.evaluate(&context));
    }
}
