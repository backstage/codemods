




const MyComponent = () => (
  <Select label="Framework" selectedKey={value} onSelectionChange={key => setValue(key as string)} options={[{ id: 'react', label: 'React' }, { id: 'angular', label: 'Angular' }]} />
);
