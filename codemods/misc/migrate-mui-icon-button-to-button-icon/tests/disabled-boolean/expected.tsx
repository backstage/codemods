import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<CloseIcon />} aria-label="close" isDisabled onPress={onClose} />
);
