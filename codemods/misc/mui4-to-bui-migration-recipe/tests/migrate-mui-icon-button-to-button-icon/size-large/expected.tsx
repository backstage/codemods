import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<ExpandIcon />} variant="tertiary" size="medium" aria-label="expand" onPress={handleExpand} />
);
