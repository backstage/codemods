import { WinstonLogger } from 'other';
import { format } from 'winston';

WinstonLogger.create({ format: format.json() });
