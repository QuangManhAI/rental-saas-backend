import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PropertiesService } from './properties.service';
import { PropertiesController } from './properties.controller';
import { Property, PropertySchema } from './properties.schema';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Property.name, schema: PropertySchema },
    ]),
    SubscriptionModule,
  ],
  controllers: [PropertiesController],
  providers: [PropertiesService],
  exports: [MongooseModule],
})
export class PropertiesModule {}
