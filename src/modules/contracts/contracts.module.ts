import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { Contract, ContractSchema } from './contracts.schema';
import { RoomsModule } from '../rooms/rooms.module';
import { TenantsModule } from '../tenants/tenants.module';
import { PropertiesModule } from '../properties/properties.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contract.name, schema: ContractSchema },
    ]),
    RoomsModule,
    TenantsModule,
    PropertiesModule,
  ],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService, MongooseModule],
})
export class ContractsModule { }
