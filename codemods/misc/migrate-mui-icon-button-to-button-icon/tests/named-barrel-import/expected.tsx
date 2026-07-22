import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<EditIcon />} variant="tertiary" size="medium" aria-label="edit" onPress={handleEdit} />
);
