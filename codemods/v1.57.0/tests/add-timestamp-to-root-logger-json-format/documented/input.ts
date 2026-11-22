import { WinstonLogger } from '@backstage/backend-defaults/rootLogger';
import { format } from 'winston';

WinstonLogger.create({
  meta: { service: 'backstage' },
  level: process.env.LOG_LEVEL || 'info',
  format:
    process.env.NODE_ENV === 'production'
      ? format.json()
      : WinstonLogger.colorFormat(),
});
