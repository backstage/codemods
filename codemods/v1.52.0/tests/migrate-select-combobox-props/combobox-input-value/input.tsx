import { Combobox } from '@backstage/ui';
import { useState } from 'react';

export function FontPicker() {
  const [query, setQuery] = useState('');
  return (
    <Combobox inputValue={query} onInputChange={setQuery} options={[]} />
  );
}
