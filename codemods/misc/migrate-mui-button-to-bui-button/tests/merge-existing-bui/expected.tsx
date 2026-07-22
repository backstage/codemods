
import { Alert, Button } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Alert status="info" icon />
    <Button variant="primary" onPress={handleSave}>Save</Button>
  </>
);
