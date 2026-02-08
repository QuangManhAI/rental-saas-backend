import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BillsService } from './bills.service';
import { BillsController } from './bills.controller';
import { Bill, BillSchema } from './bills.schema';
import { ContractsModule } from '../contracts/contracts.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Bill.name, schema: BillSchema }]),
    ContractsModule,
  ],
  controllers: [BillsController],
  providers: [BillsService],
  exports: [BillsService, MongooseModule],
})
export class BillsModule {}
