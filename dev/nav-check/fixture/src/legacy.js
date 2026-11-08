const math = require('./math');

function legacyTotal(xs) {
  return xs.reduce((s, x) => math.add(s, x), 0);
}

module.exports = { legacyTotal };
