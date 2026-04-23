import { CatalogService } from '@backstage/plugin-catalog-node';
import { AuthService } from '@backstage/backend-plugin-api';

// catalogClient is a PARAMETER typed as CatalogService.
// The object { filter: [filter] } is a request argument, NOT a CatalogService impl.
// No section should inject updateLocation into it.
export async function loadLighthouseEntities(
  catalogClient: CatalogService,
  auth: AuthService,
) {
  const filter = 'kind=component';
  const { token } = await auth.getPluginRequestToken({ onBehalfOf: await auth.getOwnServiceCredentials(), targetPluginId: 'catalog' });
  return await catalogClient.getEntities(
    {
      filter: [filter],
    },
    { token },
  );
}
