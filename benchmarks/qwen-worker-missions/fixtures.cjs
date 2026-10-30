'use strict';
function palindromeTests() {
  return [
    'import itertools, string', 'from palindrome import is_palindrome',
    'def reference(text):', "    normalized = ''.join(char.lower() for char in text if not char.isspace())",
    '    return normalized == normalized[::-1]',
    'def test_case_and_spaces():', "    assert is_palindrome('Never odd or even')", "    assert is_palindrome('A b A')",
    'def test_punctuation_is_preserved():', "    for mark in string.punctuation + '—·…«»：！？':",
    "        text = 'a' + mark + 'ba'", '        assert is_palindrome(text) == reference(text)',
    'def test_bounded_differential():', "    alphabet = ['a', 'B', ' ', '.', '-', ':', '!', '?']",
    '    for length in range(5):', '        for symbols in itertools.product(alphabet, repeat=length):',
    "            text = ''.join(symbols)", '            assert is_palindrome(text) == reference(text)', ''
  ].join('\n');
}
module.exports = { palindromeTests };
