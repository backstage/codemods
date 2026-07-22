import { Button } from '@backstage/ui';

const MyComponent = () => (
  <Button variant="primary" isDisabled={loading} onPress={handleSave}>
    Save
  </Button>
);
