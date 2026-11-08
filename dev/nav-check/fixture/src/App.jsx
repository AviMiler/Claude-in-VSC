import React, { useState } from 'react';
import Calculator, { multiply } from './math';
import { formatSum } from './utils/format';
import { Button } from './components/Button';

const handlers = {
  double: (n) => multiply(n, 2),
};

export default function App() {
  const [n, setN] = useState(1);
  const calc = new Calculator();
  calc.plus(n);
  return (
    <div>
      <Button label={formatSum(n, 1)} onClick={() => setN(handlers.double(n))} />
    </div>
  );
}
