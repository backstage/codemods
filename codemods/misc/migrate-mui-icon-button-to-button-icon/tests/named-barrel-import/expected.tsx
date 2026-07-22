import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<EditIcon />} variant="tertiary" aria-label="edit" onPress={handleEdit} />
);
