import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { Room, RoomSchema } from './rooms.schema';
import { PropertiesModule } from '../properties/properties.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Room.name, schema: RoomSchema }]),
    PropertiesModule,
  ],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [MongooseModule],
})
export class RoomsModule {}
