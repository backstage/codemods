import { WinstonLogger } from '@backstage/backend-defaults/rootLogger';
import { format } from 'winston';

function f(format: any) { WinstonLogger.create({ format: format.json() }); }
