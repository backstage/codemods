import { AppRootWrapperBlueprint } from '@backstage/plugin-app-react';
export const extension = AppRootWrapperBlueprint.make({
  params: {
    component: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </QueryClientProvider>
    ),
  },
});
