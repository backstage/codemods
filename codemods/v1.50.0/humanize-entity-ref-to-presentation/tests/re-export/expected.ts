// TODO(backstage-codemod): humanizeEntityRef, humanizeEntity were re-exported here. Consumers should pick the appropriate replacement:
//   - EntityDisplayName: for JSX rendering
//   - useEntityPresentation: for React component hooks
//   - entityPresentationSnapshot: for non-React utilities
export { EntityDisplayName, useEntityPresentation, entityPresentationSnapshot } from '@backstage/plugin-catalog-react';
