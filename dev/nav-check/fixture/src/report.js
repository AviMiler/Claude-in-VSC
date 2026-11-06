import {
  PI,
  multiply,
} from './math';

// import { add } from './math';
const label = "add";

export const area = (r) => multiply(PI, r * r);

export function describe() {
  return `${label}: ${area(2)}`;
}
