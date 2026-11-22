import { AppRootWrapperBlueprint } from '@backstage/plugin-app-react';

export default AppRootWrapperBlueprint.make({
  params: {
    component: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  },
});
