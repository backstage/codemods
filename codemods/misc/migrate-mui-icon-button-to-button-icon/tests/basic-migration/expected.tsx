import { ButtonIcon } from '@backstage/ui';

const MyComponent = () => (
  <ButtonIcon icon={<DeleteIcon />} variant="tertiary" aria-label="delete" isDisabled={!canDelete} onPress={handleDelete} />
);
