import { WinstonLogger as Logger } from '@backstage/backend-defaults/rootLogger';
import { format as wf } from 'winston';
Logger.create({ format: wf.combine(wf.timestamp(), wf.json()) });
