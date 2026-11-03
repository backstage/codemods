import { parseGerritGitilesUrl, buildGerritGitilesArchiveUrl } from './local-integration';

const ref = parseGerritGitilesUrl(url);
const archiveUrl = buildGerritGitilesArchiveUrl(config, url);
