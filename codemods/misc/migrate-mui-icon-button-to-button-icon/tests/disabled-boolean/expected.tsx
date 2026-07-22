import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<CloseIcon />} variant="tertiary" aria-label="close" isDisabled onPress={onClose} />
);
