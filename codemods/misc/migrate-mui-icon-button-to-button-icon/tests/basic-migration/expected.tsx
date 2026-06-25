

const MyComponent = () => (
  <ButtonIcon icon={<DeleteIcon />} aria-label="delete" isDisabled={!canDelete} onPress={handleDelete} />
);
