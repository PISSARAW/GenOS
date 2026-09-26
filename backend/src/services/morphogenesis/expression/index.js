'use strict';

const schema = require('./morphologyExpressionSchema');
const expression = require('./morphologyExpression');
const parser = require('./morphologyExpressionParser');
const normalizer = require('./morphologyExpressionNormalizer');
const flattener = require('./morphologyExpressionFlattener');
const defaults = require('./morphologyExpressionDefaults');
const shorthand = require('./morphologyExpressionShorthand');

module.exports = {
  ...schema,
  ...expression,
  ...parser,
  ...normalizer,
  ...flattener,
  ...defaults,
  ...shorthand
};