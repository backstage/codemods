import { TextAreaField } from '@backstage/ui';

const MyComponent = () => (
  <TextAreaField label="Description" rows={4} value={desc} onChange={newValue => setDesc(newValue)} size="medium" />
);
