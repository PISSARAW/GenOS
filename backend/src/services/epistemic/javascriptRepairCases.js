'use strict';

// Entrées et résultats finis du protocole v1 ; aucune attente fournie par le producteur.
const CASES = {
  discount: [
    ['0', 0], ['99', 99], ['100', 90], ['100.01', 90.01], ['150', 135],
    ['999.99', 899.99], ['-1', null], ['"100"', null], ['null', null],
    ['Number.NaN', null], ['Infinity', null], ['99.999', 100]
  ],
  pagination: [
    ['[1,2,3,4,5],1,2', [1, 2]], ['[1,2,3,4,5],2,2', [3, 4]],
    ['[1,2,3,4,5],3,2', [5]], ['[1,2],8,2', []], ['[],1,2', []],
    ['[1,2],0,2', []], ['[1,2],1,0', []], ['[1,2],1.5,2', []],
    ['[1,2],1,1.5', []], ['null,1,2', []], ['"abc",1,2', []], ['[1,2],1,1', [1]]
  ],
  port: [
    ['"3000"', 3000], ['" 443 "', 443], ['"80x"', null], ['0', null],
    ['65535', 65535], ['65536', null], ['" "', null], ['"-1"', null],
    ['80', 80], ['1.5', null], ['"1.5"', null], ['null', null]
  ]
};

// Le second calcul utilise une implémentation de référence, dans un contexte séparé.
const REFERENCES = {
  discount: `(total) => {
    if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) return null;
    const amount = total >= 100 ? total * 0.9 : total;
    return Math.round(amount * 100) / 100;
  }`,
  pagination: `(items, page, size) => {
    if (!Array.isArray(items) || !Number.isInteger(page) || !Number.isInteger(size)
        || page < 1 || size < 1) return [];
    const result = [];
    for (let i = (page - 1) * size; i < Math.min(page * size, items.length); i++) result.push(items[i]);
    return result;
  }`,
  port: `(value) => {
    if (typeof value === 'string') {
      const text = value.trim();
      if (!/^[0-9]+$/.test(text)) return null;
      value = Number(text);
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) return null;
    return value >= 1 && value <= 65535 ? value : null;
  }`
};

module.exports = { CASES, REFERENCES };
