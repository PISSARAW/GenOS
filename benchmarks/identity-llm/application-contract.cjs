'use strict';

const NUMBER = `Use ordinary signed integer arithmetic to evaluate the expression.
Respect every parenthesis, coefficient magnitude and signed offset. Compute the inner expression before the outer one.
Multiply each coefficient by its input, then add its signed offset. Return the final NUMBER in answer.`;

const TEXT = `Evaluate the Python string expression from the inside out.
"".join([characters]) forms a string without separators. [::-1] reverses EVERY CHARACTER, including digits.
.upper() uppercases every letter. The + operator concatenates the strings exactly once.
For nested expressions, the entire inner string including all its digits enters the outer operations.
Use the literal forward character list to track repeated letters precisely. Return the final STRING in answer.`;

function instruction(family) {
  return family === 'number' ? NUMBER : TEXT;
}

module.exports = { instruction };
