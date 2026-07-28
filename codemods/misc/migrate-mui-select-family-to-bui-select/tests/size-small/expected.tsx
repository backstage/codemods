import { Select } from '@backstage/ui';




const MyComponent = () => (
  <Select label={"Framework"} size="small" selectedKey={value} onSelectionChange={key => setValue(key as string)} options={[{ id: 'react', label: 'React' }, { id: 'angular', label: 'Angular' }]} />
);
