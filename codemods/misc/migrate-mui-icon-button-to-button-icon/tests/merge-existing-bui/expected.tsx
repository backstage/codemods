
import { Button, ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button variant="primary">Save</Button>
    <ButtonIcon icon={<CloseIcon />} aria-label="close" onPress={handleClose} />
  </>
);
