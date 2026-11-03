import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<CloseIcon />} variant="tertiary" size="medium" aria-label="close" isDisabled onPress={onClose} />
);
