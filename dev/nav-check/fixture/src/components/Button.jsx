import React from 'react';

export const Button = ({ label, onClick }) => (
  <button onClick={onClick}>{label}</button>
);
