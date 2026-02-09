import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { Contract, ContractDocument } from './contracts.schema';
import { Room, RoomDocument } from '../rooms/rooms.schema';
import { Tenant, TenantDocument } from '../tenants/tenants.schema';
import { CreateContractDto } from './dto/create-contract.dto';
import { UserPayload } from '../../shared/types';
import { RoomStatus } from '../rooms/enums/room-status.enum';
import { ContractStatus } from './enums/contract-status.enum';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Room.name)
    private readonly roomModel: Model<RoomDocument>,
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) { }

  /**
   * Create a new contract within a MongoDB transaction.
   * Validates room availability and tenant existence,
   * then atomically creates the contract and marks the room OCCUPIED.
   * Returns contract with Telegram deep link for staff to share.
   */
  async create(
    dto: CreateContractDto,
    user: UserPayload,
  ): Promise<ContractDocument & { telegramLink: string }> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const ownerObjectId = new Types.ObjectId(user.ownerId);

      // 1. Validate tenant exists and belongs to owner
      const tenant = await this.tenantModel
        .findOne({ _id: dto.tenantId, ownerId: ownerObjectId })
        .session(session)
        .lean();

      if (!tenant) {
        throw new NotFoundException('Tenant not found or access denied');
      }

      // 2. Validate room exists, belongs to owner, and is AVAILABLE
      const room = await this.roomModel
        .findOne({ _id: dto.roomId, ownerId: ownerObjectId })
        .session(session);

      if (!room) {
        throw new NotFoundException('Room not found or access denied');
      }

      if (room.status !== RoomStatus.AVAILABLE) {
        throw new BadRequestException(
          'Room is not available. Current status: ' + room.status,
        );
      }

      // 3. Check no active contract exists for this room
      const existingContract = await this.contractModel
        .findOne({
          roomId: new Types.ObjectId(dto.roomId),
          status: ContractStatus.ACTIVE,
        })
        .session(session)
        .lean();

      if (existingContract) {
        // Self-healing: active contract exists but room status was AVAILABLE.
        // Update room status to OCCUPIED and inform user.
        await this.roomModel
          .updateOne(
            { _id: dto.roomId },
            { status: RoomStatus.OCCUPIED },
          )
          .session(session);

        await session.commitTransaction();

        throw new BadRequestException(
          'Room status inconsistency detected. The room has been marked as OCCUPIED. Please refresh the page.',
        );
      }

      // 4. Create contract
      const [contract] = await this.contractModel.create(
        [
          {
            roomId: new Types.ObjectId(dto.roomId),
            tenantId: new Types.ObjectId(dto.tenantId),
            startDate: new Date(dto.startDate),
            endDate: new Date(dto.endDate),
            deposit: dto.deposit || 0,
            rentPrice: dto.rentPrice,
            status: ContractStatus.ACTIVE,
            ownerId: ownerObjectId,
          },
        ],
        { session },
      );

      // 5. Atomically update room status to OCCUPIED
      await this.roomModel
        .updateOne(
          { _id: dto.roomId },
          { status: RoomStatus.OCCUPIED },
        )
        .session(session);

      await session.commitTransaction();
      this.logger.log(
        `Contract created: ${contract._id} for room ${dto.roomId}`,
      );

      // 6. Generate Telegram deep link for staff to share with tenant
      const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'quangManhAI_bot';
      const telegramLink = `https://t.me/${botUsername}?start=contract_${contract._id}`;

      return {
        ...contract.toObject(),
        telegramLink,
      } as ContractDocument & { telegramLink: string };
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      session.endSession();
    }
  }

  async findAll(user: UserPayload): Promise<ContractDocument[]> {
    return this.contractModel
      .find({ ownerId: new Types.ObjectId(user.ownerId) })
      .populate('roomId', 'name price')
      .populate('tenantId', 'fullName phone')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string, user: UserPayload): Promise<ContractDocument> {
    const contract = await this.contractModel
      .findOne({
        _id: id,
        ownerId: new Types.ObjectId(user.ownerId),
      })
      .populate('roomId')
      .populate('tenantId')
      .lean();

    if (!contract) {
      throw new NotFoundException('Contract not found or access denied');
    }
    return {
      ...contract,
      telegramLink: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || 'quangManhAI_bot'}?start=contract_${contract._id}`,
    } as any;
  }

  /**
   * Terminate a contract within a MongoDB transaction.
   * Sets contract to TERMINATED and releases the room back to AVAILABLE.
   */
  async terminate(id: string, user: UserPayload): Promise<ContractDocument> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const contract = await this.contractModel
        .findOne({
          _id: id,
          ownerId: new Types.ObjectId(user.ownerId),
        })
        .session(session);

      if (!contract) {
        throw new NotFoundException('Contract not found or access denied');
      }

      if (contract.status !== ContractStatus.ACTIVE) {
        throw new BadRequestException(
          'Only active contracts can be terminated',
        );
      }

      // Update contract
      contract.status = ContractStatus.TERMINATED;
      contract.endDate = new Date();
      await contract.save({ session });

      // Release room
      await this.roomModel
        .updateOne(
          { _id: contract.roomId },
          { status: RoomStatus.AVAILABLE },
        )
        .session(session);

      await session.commitTransaction();
      this.logger.log(`Contract terminated: ${id}`);
      return contract;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}
