import * as m from './math';

export function callByName(name) {
  return m[name](1, 2);
}
