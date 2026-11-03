import { Combobox } from '@backstage/ui';
import { useState } from 'react';

export function FontPicker() {
  const [query, setQuery] = useState('');
  return (
    <Combobox search={{ inputValue: query, onInputChange: setQuery }} options={[]} />
  );
}
