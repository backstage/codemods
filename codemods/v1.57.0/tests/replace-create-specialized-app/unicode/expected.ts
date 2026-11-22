import { prepareSpecializedApp } from '@backstage/frontend-app-api';

// Bootstraps the app — see “docs”
export function App() {
  // TODO(backstage-codemod): advanced.apis was removed. Reuse a finalized app via advanced.sessionState, register custom APIs with ApiBlueprint, pass config via the top-level config option. For sign-in flows render the bootstrap app and use onFinalized() instead of finalize().
  const app = prepareSpecializedApp({
    features,
    advanced: { apis: myApis },
  }).finalize();
  return app.tree.root;
}
