import { Combobox } from '@backstage/ui';


const FruitPicker = ({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) => (
  <Combobox options={[{ value: 'Apple', label: 'Apple' }, { value: 'Banana', label: 'Banana' }, { value: 'Cherry', label: 'Cherry' }]} value={value} onSelectionChange={onChange} label="Fruit" size="medium" />
);
