export function add(a, b) {
  return a + b;
}

export function multiply(a, b) {
  let r = 0;
  for (let i = 0; i < b; i++) r = add(r, a);
  return r;
}

export const PI = 3.14159;

export default class Calculator {
  constructor() {
    this.total = 0;
  }
  plus(n) {
    this.total = add(this.total, n);
    return this;
  }
}
