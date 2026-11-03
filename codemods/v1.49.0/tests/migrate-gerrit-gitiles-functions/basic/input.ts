import { parseGerritGitilesUrl, buildGerritGitilesArchiveUrl } from '@backstage/integration';

const ref = parseGerritGitilesUrl(url);
const archiveUrl = buildGerritGitilesArchiveUrl(config, url);
