
import { Alert, Button } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Alert status="info" icon />
    <Button variant="primary" size="medium" onPress={handleSave}>Save</Button>
  </>
);
