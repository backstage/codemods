import { WinstonLogger } from '@backstage/backend-defaults/rootLogger';
import { format } from 'winston';

WinstonLogger.create({ format: format.combine(format.timestamp(), format.json()) });
