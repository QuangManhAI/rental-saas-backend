import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { Contract } from './contracts.schema';
import { Room } from '../rooms/rooms.schema';
import { Tenant } from '../tenants/tenants.schema';
import { RoomStatus } from '../rooms/enums/room-status.enum';
import { ContractStatus } from './enums/contract-status.enum';

// ── Mock factories ──────────────────────────────────────────────────────────

function makeSession() {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
    inTransaction: jest.fn().mockReturnValue(true),
  };
}

function makeQuery(resolved: unknown) {
  return {
    session: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(resolved),
    }),
  };
}

/** For calls like findOne().session(s) where the result is awaited directly (no .lean()) */
function makeSessionQuery(resolved: unknown) {
  return { session: jest.fn().mockResolvedValue(resolved) };
}

function makeUpdateQuery() {
  return { session: jest.fn().mockResolvedValue({ modifiedCount: 1 }) };
}

const USER = { userId: 'u1', ownerId: 'owner1', role: 'owner' } as any;

const MOCK_TENANT = { _id: 'tenant1', fullName: 'Nguyễn A', ownerId: 'owner1' };

const MOCK_ROOM_AVAILABLE = {
  _id: 'room1',
  name: 'Phòng 101',
  status: RoomStatus.AVAILABLE,
  ownerId: 'owner1',
  save: jest.fn().mockResolvedValue(undefined),
};

const MOCK_ROOM_OCCUPIED = {
  _id: 'room1',
  name: 'Phòng 101',
  status: RoomStatus.OCCUPIED,
  ownerId: 'owner1',
};

const CONTRACT_DTO = {
  roomId: 'room1',
  tenantId: 'tenant1',
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  rentPrice: 3_000_000,
  deposit: 3_000_000,
} as any;

// ── Test suite ───────────────────────────────────────────────────────────────

describe('ContractsService', () => {
  let service: ContractsService;
  let contractModel: jest.Mocked<any>;
  let roomModel: jest.Mocked<any>;
  let tenantModel: jest.Mocked<any>;
  let connection: jest.Mocked<any>;
  let session: ReturnType<typeof makeSession>;

  beforeEach(async () => {
    session = makeSession();

    contractModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
    };

    roomModel = {
      findOne: jest.fn(),
      updateOne: jest.fn(),
    };

    tenantModel = {
      findOne: jest.fn(),
    };

    connection = {
      startSession: jest.fn().mockResolvedValue(session),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: getModelToken(Contract.name), useValue: contractModel },
        { provide: getModelToken(Room.name), useValue: roomModel },
        { provide: getModelToken(Tenant.name), useValue: tenantModel },
        { provide: getConnectionToken(), useValue: connection },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create() ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates contract and marks room as OCCUPIED', async () => {
      // tenant found
      tenantModel.findOne.mockReturnValue({ session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(MOCK_TENANT) }) });
      // room available
      roomModel.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({ ...MOCK_ROOM_AVAILABLE }) });
      // no existing active contract
      contractModel.findOne.mockReturnValue({ session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });

      const mockContract = {
        _id: 'c1',
        roomId: 'room1',
        tenantId: 'tenant1',
        status: ContractStatus.ACTIVE,
        toObject: jest.fn().mockReturnValue({ _id: 'c1', roomId: 'room1' }),
      };
      contractModel.create.mockResolvedValue([mockContract]);
      roomModel.updateOne.mockReturnValue({ session: jest.fn().mockResolvedValue({ modifiedCount: 1 }) });

      const result = await service.create(CONTRACT_DTO, USER);

      expect(result).toHaveProperty('telegramLink');
      expect(session.commitTransaction).toHaveBeenCalled();
      expect(roomModel.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'room1' }),
        { status: RoomStatus.OCCUPIED },
      );
    });

    it('throws NotFoundException when tenant does not belong to owner', async () => {
      tenantModel.findOne.mockReturnValue({ session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });

      await expect(service.create(CONTRACT_DTO, USER)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when room not found', async () => {
      tenantModel.findOne.mockReturnValue({ session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(MOCK_TENANT) }) });
      roomModel.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });

      await expect(service.create(CONTRACT_DTO, USER)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when room is not AVAILABLE (double booking)', async () => {
      tenantModel.findOne.mockReturnValue({ session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(MOCK_TENANT) }) });
      roomModel.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({ ...MOCK_ROOM_OCCUPIED }) });

      await expect(service.create(CONTRACT_DTO, USER)).rejects.toThrow(BadRequestException);
      await expect(service.create(CONTRACT_DTO, USER)).rejects.toThrow('not available');
    });

    it('throws BadRequestException when active contract already exists for room', async () => {
      tenantModel.findOne.mockReturnValue({ session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(MOCK_TENANT) }) });
      roomModel.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({ ...MOCK_ROOM_AVAILABLE }) });

      // existing active contract
      contractModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ _id: 'old-contract', status: ContractStatus.ACTIVE }),
        }),
      });
      roomModel.updateOne.mockReturnValue({ session: jest.fn().mockResolvedValue({}) });

      await expect(service.create(CONTRACT_DTO, USER)).rejects.toThrow(BadRequestException);
    });
  });

  // ── terminate() ────────────────────────────────────────────────────────────

  describe('terminate()', () => {
    it('terminates contract and releases room to AVAILABLE', async () => {
      const mockContract = {
        _id: 'c1',
        roomId: 'room1',
        status: ContractStatus.ACTIVE,
        endDate: null,
        save: jest.fn().mockResolvedValue(undefined),
      };
      contractModel.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(mockContract) });
      roomModel.updateOne.mockReturnValue({ session: jest.fn().mockResolvedValue({ modifiedCount: 1 }) });

      const result = await service.terminate('c1', USER);

      expect(result.status).toBe(ContractStatus.TERMINATED);
      expect(roomModel.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'room1' }),
        { status: RoomStatus.AVAILABLE },
      );
      expect(session.commitTransaction).toHaveBeenCalled();
    });

    it('throws NotFoundException when contract not found', async () => {
      contractModel.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });

      await expect(service.terminate('c1', USER)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when contract is already terminated', async () => {
      contractModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue({ _id: 'c1', status: ContractStatus.TERMINATED }),
      });

      await expect(service.terminate('c1', USER)).rejects.toThrow(BadRequestException);
      await expect(service.terminate('c1', USER)).rejects.toThrow('Only active contracts');
    });
  });
});
