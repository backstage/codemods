import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<DeleteIcon />} variant="tertiary" size="medium" aria-label="delete" isDisabled={!canDelete} onPress={handleDelete} />
);
