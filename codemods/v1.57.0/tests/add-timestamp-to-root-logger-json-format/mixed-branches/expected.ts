import { WinstonLogger } from '@backstage/backend-defaults/rootLogger';
import { format } from 'winston';

WinstonLogger.create({
  format: prod ? format.combine(format.timestamp(), format.json()) : format.combine(format.timestamp(), format.simple()),
});
