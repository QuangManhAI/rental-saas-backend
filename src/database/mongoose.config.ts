import { ConfigService } from '@nestjs/config';
import {
  MongooseModuleAsyncOptions,
  MongooseModuleFactoryOptions,
} from '@nestjs/mongoose';

export const mongooseAsyncConfig: MongooseModuleAsyncOptions = {
  useFactory: (
    configService: ConfigService,
  ): MongooseModuleFactoryOptions => ({
    uri: configService.getOrThrow<string>('database.uri'),
    dbName: configService.get<string>('database.name'),
    retryAttempts: 3,
    retryDelay: 500,
  }),
  inject: [ConfigService],
};
