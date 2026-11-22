import { BrowserRouter } from 'react-router-dom';
import { RouterBlueprint } from '@backstage/plugin-app-react';
export const extension = RouterBlueprint.make({
  params: {
    component: ({ children }) => (
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </QueryClientProvider>
      </BrowserRouter>
    ),
  },
});
