import { ButtonIcon } from '@backstage/ui';

const MyComponent = (props: any) => (
  <ButtonIcon icon={<StarIcon />} variant="tertiary" size="medium" aria-label="action" {...props} />
);
