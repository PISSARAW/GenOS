'use strict';

const NUMBER = `Use ordinary signed integer arithmetic to evaluate the expression.
Respect every parenthesis, coefficient magnitude and signed offset. Compute the inner expression before the outer one.
Do not merely copy an input or omit the final addition. Return the final NUMBER in answer, not a formula or a string.`;

const TEXT = `Evaluate the string program from the inside out.
join([characters]) forms a string without separators. reverse(x) reverses EVERY CHARACTER of x, including digits.
upper(x) uppercases every letter. concat(prefix,x,suffix) joins those three strings exactly once.
For nested programs, the entire inner string including all its digits enters the outer reverse/upper/concat.
Use the literal forward character list to track repeated letters precisely. Return the final STRING in answer.`;

function instruction(family) {
  return family === 'number' ? NUMBER : TEXT;
}

module.exports = { instruction };
