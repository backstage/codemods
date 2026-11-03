import { Button } from '@backstage/ui';

const MyComponent = () => (
  <Button variant="primary" isDisabled={loading} size="medium" onPress={handleSave}>
    Save
  </Button>
);
