import * as integration from '@backstage/integration';

const ref = integration.parseGitilesUrlRef(url);
const archiveUrl = integration.buildGerritGitilesArchiveUrlFromLocation(config, url);
