import { parseGitilesUrlRef, buildGerritGitilesArchiveUrlFromLocation } from '@backstage/integration';

const ref = parseGitilesUrlRef(url);
const archiveUrl = buildGerritGitilesArchiveUrlFromLocation(config, url);
