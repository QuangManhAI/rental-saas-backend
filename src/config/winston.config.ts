import * as winston from 'winston';
import { WinstonModuleOptions } from 'nest-winston';

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

const devFormat = combine(
  errors({ stack: true }),
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ timestamp, level, message, context, requestId, stack, ...meta }) => {
    const ctx = context ? `[${context}]` : '';
    const rid = requestId ? ` rid=${requestId}` : '';
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const err = stack ? `\n${stack}` : '';
    return `${timestamp} ${level} ${ctx}${rid}: ${message}${extra}${err}`;
  }),
);

const prodFormat = combine(
  errors({ stack: true }),
  timestamp(),
  json(),
);

export const winstonConfig: WinstonModuleOptions = {
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    ...(process.env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10 MB
            maxFiles: 5,
            format: combine(errors({ stack: true }), timestamp(), json()),
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 20 * 1024 * 1024, // 20 MB
            maxFiles: 10,
            format: combine(errors({ stack: true }), timestamp(), json()),
          }),
        ]
      : []),
  ],
};
