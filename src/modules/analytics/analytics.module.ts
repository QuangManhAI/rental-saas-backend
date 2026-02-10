import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { Bill, BillSchema } from '../bills/bills.schema';
import { Contract, ContractSchema } from '../contracts/contracts.schema';
import { Room, RoomSchema } from '../rooms/rooms.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Bill.name, schema: BillSchema },
            { name: Contract.name, schema: ContractSchema },
            { name: Room.name, schema: RoomSchema },
        ]),
    ],
    controllers: [AnalyticsController],
    providers: [AnalyticsService],
})
export class AnalyticsModule { }
