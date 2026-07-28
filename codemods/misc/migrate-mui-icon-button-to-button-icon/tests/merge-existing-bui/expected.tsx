
import { Button, ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button variant="primary">Save</Button>
    <ButtonIcon icon={<CloseIcon />} variant="tertiary" size="medium" aria-label="close" onPress={handleClose} />
  </>
);
