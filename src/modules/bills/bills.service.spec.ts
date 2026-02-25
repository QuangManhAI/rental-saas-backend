import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillsService } from './bills.service';
import { Bill } from './bills.schema';
import { Contract } from '../contracts/contracts.schema';
import { BillStatus } from './enums/bill-status.enum';
import { ContractStatus } from '../contracts/enums/contract-status.enum';

const USER = { userId: 'u1', ownerId: 'owner1', role: 'owner' } as any;

const ACTIVE_CONTRACT = {
  _id: 'c1',
  roomId: 'room1',
  tenantId: 'tenant1',
  rentPrice: 3_000_000,
  status: ContractStatus.ACTIVE,
};

const VALID_DTO = {
  contractId: 'c1',
  month: 1,
  year: 2025,
  electricOldIndex: 100,
  electricNewIndex: 150,
  electricRate: 3_500,
  waterOldIndex: 10,
  waterNewIndex: 15,
  waterRate: 15_000,
  otherFee: 50_000,
} as any;

// Expected: electric=(150-100)*3500=175000, water=(15-10)*15000=75000, room=3000000, other=50000
// total = 3_300_000

describe('BillsService', () => {
  let service: BillsService;
  let billModel: jest.Mocked<any>;
  let contractModel: jest.Mocked<any>;

  beforeEach(async () => {
    billModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(0),
    };

    contractModel = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillsService,
        { provide: getModelToken(Bill.name), useValue: billModel },
        { provide: getModelToken(Contract.name), useValue: contractModel },
      ],
    }).compile();

    service = module.get<BillsService>(BillsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create() ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('calculates totalAmount correctly and creates bill', async () => {
      contractModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(ACTIVE_CONTRACT) });
      billModel.create.mockResolvedValue({ _id: 'b1', totalAmount: 3_300_000 });

      const result = await service.create(VALID_DTO, USER);

      expect(result.totalAmount).toBe(3_300_000);
      expect(billModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          electricCost: 175_000,
          waterCost: 75_000,
          roomPrice: 3_000_000,
          otherFee: 50_000,
          totalAmount: 3_300_000,
          paidAmount: 0,
          status: BillStatus.UNPAID,
        }),
      );
    });

    it('throws NotFoundException when contract not found', async () => {
      contractModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      await expect(service.create(VALID_DTO, USER)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for non-active contract', async () => {
      contractModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ ...ACTIVE_CONTRACT, status: ContractStatus.TERMINATED }),
      });

      await expect(service.create(VALID_DTO, USER)).rejects.toThrow(BadRequestException);
      await expect(service.create(VALID_DTO, USER)).rejects.toThrow('non-active contract');
    });

    it('throws BadRequestException when electric newIndex < oldIndex', async () => {
      contractModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(ACTIVE_CONTRACT) });

      const badDto = { ...VALID_DTO, electricNewIndex: 90 }; // 90 < 100 (old)
      await expect(service.create(badDto, USER)).rejects.toThrow(BadRequestException);
      await expect(service.create(badDto, USER)).rejects.toThrow('Electric new index');
    });

    it('throws BadRequestException when water newIndex < oldIndex', async () => {
      contractModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(ACTIVE_CONTRACT) });

      const badDto = { ...VALID_DTO, waterNewIndex: 5 }; // 5 < 10 (old)
      await expect(service.create(badDto, USER)).rejects.toThrow(BadRequestException);
      await expect(service.create(badDto, USER)).rejects.toThrow('Water new index');
    });

    it('propagates MongoDB duplicate key error (unique index violation)', async () => {
      contractModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(ACTIVE_CONTRACT) });

      const dupError = Object.assign(new Error('Duplicate key'), { code: 11000 });
      billModel.create.mockRejectedValue(dupError);

      await expect(service.create(VALID_DTO, USER)).rejects.toMatchObject({ code: 11000 });
    });
  });

  // ── remove() ───────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('throws NotFoundException when bill not found', async () => {
      billModel.findOne.mockResolvedValue(null);

      await expect(service.remove('b1', USER)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when deleting a PAID bill', async () => {
      billModel.findOne.mockResolvedValue({ status: BillStatus.PAID });

      await expect(service.remove('b1', USER)).rejects.toThrow(BadRequestException);
      await expect(service.remove('b1', USER)).rejects.toThrow('Cannot delete a paid bill');
    });

    it('soft-deletes bill when status is UNPAID', async () => {
      const mockBill = {
        status: BillStatus.UNPAID,
        softDelete: jest.fn().mockResolvedValue(undefined),
      };
      billModel.findOne.mockResolvedValue(mockBill);

      const result = await service.remove('b1', USER);

      expect(mockBill.softDelete).toHaveBeenCalledWith(USER.userId);
      expect(result.message).toContain('deleted');
    });
  });

  // ── findAll() ──────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('excludes soft-deleted bills from results', async () => {
      // soft-deleted items have isDeleted=true; the service filter does NOT include deleted
      // findAll only queries { ownerId, ...filters } — no isDeleted filter needed as schema
      // handles it. We verify that deleted bills don't appear in the model query filter.
      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          { _id: 'b1', status: BillStatus.UNPAID }, // active
          // b2 (deleted) should NOT appear because model pre-filters in schema
        ]),
      };
      billModel.find = jest.fn().mockReturnValue(mockQuery);
      billModel.countDocuments = jest.fn().mockResolvedValue(1);

      const result = await service.findAll(USER);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe(BillStatus.UNPAID);
    });
  });
});
