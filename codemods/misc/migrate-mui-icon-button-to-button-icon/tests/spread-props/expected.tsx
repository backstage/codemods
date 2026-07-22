import { ButtonIcon } from '@backstage/ui';

const MyComponent = (props: any) => (
  <ButtonIcon icon={<StarIcon />} variant="tertiary" aria-label="action" {...props} />
);
