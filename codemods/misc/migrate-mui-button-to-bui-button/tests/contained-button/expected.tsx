import { Button } from '@backstage/ui';

const MyComponent = () => (
  <Button variant="primary" isDisabled={loading} onClick={handleSave}>
    Save
  </Button>
);
