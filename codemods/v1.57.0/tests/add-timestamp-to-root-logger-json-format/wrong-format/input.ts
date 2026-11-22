import { WinstonLogger } from '@backstage/backend-defaults/rootLogger';
import { format } from 'other';

WinstonLogger.create({ format: format.json() });
