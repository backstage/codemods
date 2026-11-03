import * as integration from '@backstage/integration';

const ref = integration.parseGerritGitilesUrl(url);
const archiveUrl = integration.buildGerritGitilesArchiveUrl(config, url);
