import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAdminPoints, parseAdminPoints } from './adminPointsInput';

test('admin point input groups integers with dots without changing their value', () => {
  for (const [digits, display] of [['', ''], ['0', '0'], ['00010', '10'], ['1000', '1.000'], ['10000', '10.000'], ['100000', '100.000']]) {
    assert.equal(formatAdminPoints(digits), display);
    assert.equal(parseAdminPoints(display), digits.replace(/^0+(?=\d)/, ''));
  }
  assert.equal(parseAdminPoints('10,000'), '10000');
  assert.equal(parseAdminPoints(' 100.000 '), '100000');
  for (const invalid of ['-10', '+10', '1.5', '1,5', '1e3', '10k', '1.000,000', '10 000', 'Infinity', '12345678901234567']) assert.equal(parseAdminPoints(invalid), null);
});
