'use strict';

const { isDeepStrictEqual } = require('node:util');

const VERSION = 'genos.prime-integral-postconditions/v1';
const STRATEGIES = new Set(['prime_integral_convolution', 'prime_integral_quadrature']);
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29];
const TOLERANCE = 2e-4;

function outcome(status, reason, strategy) {
  return { schema: VERSION, status, reason, strategy };
}

function validTerms(terms) {
  return Array.isArray(terms) && terms.length > 0 && terms.length <= PRIMES.length
    && terms.every((prime, index) => prime === PRIMES[index]);
}

function positivePower(value, exponent) {
  return value > 0 ? value ** exponent : 0;
}

function convolutionDensity(widths) {
  const all = [1, ...widths];
  const order = all.length - 1;
  const center = all.reduce((sum, width) => sum + width, 0);
  let alternating = 0;
  for (let mask = 0; mask < 2 ** all.length; mask += 1) {
    let shifted = center;
    let parity = 0;
    for (let index = 0; index < all.length; index += 1) {
      if (mask & (2 ** index)) { shifted -= 2 * all[index]; parity += 1; }
    }
    alternating += (parity % 2 ? -1 : 1) * positivePower(shifted, order);
  }
  const factorial = Array.from({ length: order }, (_, index) => index + 1)
    .reduce((product, value) => product * value, 1);
  const scale = all.reduce((product, width) => product * 2 * width, 1) * factorial;
  return alternating / scale;
}

function quadratureIntegral(widths) {
  const partitions = 50000;
  const step = 50 / partitions;
  let weighted = 0;
  for (let index = 0; index <= partitions; index += 1) {
    const x = index * step;
    const product = [1, ...widths].reduce((value, width) => {
      const scaled = width * x;
      return value * (scaled === 0 ? 1 : Math.sin(scaled) / scaled);
    }, 1);
    weighted += (index === 0 || index === partitions ? 1 : index % 2 ? 4 : 2) * product;
  }
  return weighted * step / 3;
}

function close(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= TOLERANCE;
}

function metadataMatches(item, index) {
  const observed = { numerator: item.numerator, denominator: item.denominator, deficit: item.deficit };
  if (index <= 2) return item.exact === 'pi/2'
    && isDeepStrictEqual(observed, { numerator: 1, denominator: 2, deficit: '0' });
  if (index === 3) return item.exact === '21599*pi/43200'
    && isDeepStrictEqual(observed, { numerator: 21599, denominator: 43200, deficit: 'pi/43200' });
  return String(item.exact).startsWith('pi*')
    && isDeepStrictEqual(observed, { numerator: null, denominator: null, deficit: null });
}

function expectedIntegral(widths, strategy) {
  return strategy === 'prime_integral_convolution'
    ? Math.PI * convolutionDensity(widths) : quadratureIntegral(widths);
}

function resultHeaderMatches(result, terms) {
  return result?.method === 'compute_integral' && result.version === 1 && result.verified === true
    && isDeepStrictEqual(result.terms, terms);
}

function itemMatches(item, input) {
  if (!item || !isDeepStrictEqual(item.terms, input.prefix)) return false;
  if (!metadataMatches(item, input.index)) return false;
  return close(item.numeric, input.expected) && close(item.densityAtZero, input.expected / Math.PI);
}

function summaryMatches(result, termCount) {
  const expected = { I_2: termCount >= 2 ? 'pi/2' : null,
    I_3: termCount >= 3 ? '21599*pi/43200' : null,
    symmetryBrokenAt: termCount >= 3 ? 3 : null,
    borweinHeuristicAppliesToPrimes: false };
  const observed = { I_2: result.I_2, I_3: result.I_3,
    symmetryBrokenAt: result.symmetryBrokenAt,
    borweinHeuristicAppliesToPrimes: result.borweinHeuristicAppliesToPrimes };
  return isDeepStrictEqual(observed, expected);
}

function resultMatches(subject, strategy) {
  const terms = subject.method.parameters.terms;
  const result = subject.result;
  if (!resultHeaderMatches(result, terms)) return false;
  for (let index = 1; index <= terms.length; index += 1) {
    const item = result.results?.[`I_${index}`];
    const prefix = terms.slice(0, index);
    const expected = expectedIntegral(prefix.map(prime => 1 / prime), strategy);
    if (!itemMatches(item, { prefix, index, expected })) return false;
  }
  return summaryMatches(result, terms.length);
}

function check(subject, strategy) {
  const terms = subject?.method?.parameters?.terms;
  if (!STRATEGIES.has(strategy) || subject?.method?.methodId !== 'compute_integral'
    || subject.method.version !== 1 || !validTerms(terms)) {
    return outcome('inconclusive', 'prime_integral_subject_invalid', strategy);
  }
  return outcome(resultMatches(subject, strategy) ? 'verified' : 'refuted',
    'prime_integral_recomputed', strategy);
}

module.exports = { STRATEGIES, check };
