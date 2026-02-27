import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Contract, ContractDocument } from './contracts.schema';
import { Room, RoomDocument } from '../rooms/rooms.schema';
import { Tenant, TenantDocument } from '../tenants/tenants.schema';
import { Property, PropertyDocument } from '../properties/properties.schema';
import { CreateContractDto } from './dto/create-contract.dto';
import { UserPayload } from '../../shared/types';
import { RoomStatus } from '../rooms/enums/room-status.enum';
import { ContractStatus } from './enums/contract-status.enum';
import { MailService } from '../mail/mail.service';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  private readonly frontendUrl: string;
  private readonly botUsername: string;

  constructor(
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Room.name)
    private readonly roomModel: Model<RoomDocument>,
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl = configService.get<string>('frontendUrl') || 'http://localhost:3000';
    this.botUsername = configService.get<string>('telegram.botUsername') || 'quangManhAI_bot';
  }

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
      const telegramLink = `https://t.me/${this.botUsername}?start=contract_${contract._id}`;

      // 7. Fire-and-forget: send contract confirmation email to tenant
      this.sendContractEmail(contract, tenant, room, telegramLink).catch((err) =>
        this.logger.error(`Failed to send contract email: ${err.message}`),
      );

      return {
        ...contract.toObject(),
        telegramLink,
      } as ContractDocument & { telegramLink: string };
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      // MongoDB duplicate key on unique_active_contract_per_room index
      if ((error as any)?.code === 11000) {
        throw new BadRequestException(
          'Room already has an active contract. Double-booking prevented.',
        );
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
      telegramLink: `https://t.me/${this.botUsername}?start=contract_${contract._id}`,
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

  private async sendContractEmail(
    contract: ContractDocument,
    tenant: any,
    room: RoomDocument,
    telegramLink: string,
  ): Promise<void> {
    if (!tenant.email) return;

    const property = await this.propertyModel.findById(room.propertyId).lean();

    const fmtDate = (d: Date) =>
      d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const contractCtx = {
      tenantName: tenant.fullName,
      propertyName: property?.name ?? 'N/A',
      propertyAddress: property?.address ?? 'N/A',
      roomName: room.name,
      roomArea: room.area,
      startDate: fmtDate(new Date(contract.startDate)),
      endDate: fmtDate(new Date(contract.endDate)),
      rentPrice: contract.rentPrice,
      deposit: contract.deposit ?? 0,
      telegramLink,
      portalUrl: `${this.frontendUrl}/tenant`,
    };

    // If tenant is not activated yet → generate initial password & activate
    if (!tenant.isActivated) {
      const initialPassword = randomBytes(4).toString('hex'); // 8-char random password
      const hashedPassword = await bcrypt.hash(initialPassword, 12);

      await this.tenantModel.updateOne(
        { _id: tenant._id },
        {
          password: hashedPassword,
          isActivated: true,
          activationToken: null,
          activationTokenExpiresAt: null,
        },
      );

      this.logger.log(`Tenant ${tenant.email} auto-activated with initial password on contract creation`);

      await this.mailService.sendContractWithPassword(tenant.email, {
        ...contractCtx,
        email: tenant.email,
        initialPassword,
      });
    } else {
      // Already activated → send normal contract email
      await this.mailService.sendContractCreated(tenant.email, contractCtx);
    }

    this.logger.log(`Contract email sent to tenant ${tenant.email}`);
  }
}
