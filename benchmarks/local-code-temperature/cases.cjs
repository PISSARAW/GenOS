'use strict';
function test(args, expected) { return { args, expected }; }
const CASES = [
  { id: 'discount', specification: 'Export a CommonJS function discount(total). Accept only finite numbers >= 0, otherwise return null. Apply 10 percent discount when total >= 100, and round the returned amount to two decimal places. Keep the name/function export.',
    original: "'use strict';\nfunction discount(total) { return total > 100 ? Math.round(total * 90) / 100 : total; }\nmodule.exports = discount;\n",
    tests: [test('0', 0), test('99', 99), test('100', 90), test('100.01', 90.01),
      test('150', 135), test('999.99', 899.99), test('-1', null), test('"100"', null),
      test('null', null), test('Number.NaN', null), test('Infinity', null), test('99.999', 100)] },
  { id: 'pagination', specification: 'Export a CommonJS function paginate(items, page, pageSize). Pages start at 1. Return exactly the requested slice without mutating items. Return [] when items is not an array, page or pageSize is not a positive integer, or the page is beyond the end.',
    original: "'use strict';\nfunction paginate(items, page, pageSize) { return items.slice(page * pageSize, (page + 1) * pageSize); }\nmodule.exports = paginate;\n",
    tests: [test('[1,2,3,4,5],1,2', [1,2]), test('[1,2,3,4,5],2,2', [3,4]),
      test('[1,2,3,4,5],3,2', [5]), test('[1,2],8,2', []), test('[],1,2', []),
      test('[1,2],0,2', []), test('[1,2],1,0', []), test('[1,2],1.5,2', []),
      test('[1,2],1,1.5', []), test('null,1,2', []), test('"abc",1,2', []),
      test('[1,2],1,1', [1])] },
  { id: 'port', specification: 'Export a CommonJS function parsePort(value). Accept an integer number, or a string containing only decimal digits after trimming whitespace. Accept only integers from 1 through 65535. Return null for every other input; never substitute a default port.',
    original: "'use strict';\nfunction parsePort(value) { return Number.parseInt(value, 10) || 3000; }\nmodule.exports = parsePort;\n",
    tests: [test('"3000"', 3000), test('" 443 "', 443), test('"80x"', null),
      test('0', null), test('65535', 65535), test('65536', null), test('" "', null),
      test('"-1"', null), test('80', 80), test('1.5', null), test('"1.5"', null), test('null', null)] }
];
module.exports = { CASES };
