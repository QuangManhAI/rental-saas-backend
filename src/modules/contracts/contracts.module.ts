import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { Contract, ContractSchema } from './contracts.schema';
import { RoomsModule } from '../rooms/rooms.module';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contract.name, schema: ContractSchema },
    ]),
    RoomsModule,
    TenantsModule,
  ],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [MongooseModule],
})
export class ContractsModule {}
