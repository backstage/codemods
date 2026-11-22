import { createSpecializedApp } from '@backstage/frontend-app-api';

// Bootstraps the app — see “docs”
export function App() {
  const app = createSpecializedApp({
    features,
    advanced: { apis: myApis },
  });
  return app.tree.root;
}
