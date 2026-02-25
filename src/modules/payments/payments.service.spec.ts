import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Payment } from './payments.schema';
import { Bill } from '../bills/bills.schema';
import { Contract } from '../contracts/contracts.schema';
import { Tenant } from '../tenants/tenants.schema';
import { BillStatus } from '../bills/enums/bill-status.enum';

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

function makeQuery(resolvedValue: unknown) {
  return { session: jest.fn().mockResolvedValue(resolvedValue) };
}

function makeAggregateQuery(resolvedValue: unknown) {
  return { session: jest.fn().mockResolvedValue(resolvedValue) };
}

const USER = { userId: 'u1', ownerId: 'owner1', role: 'owner' } as any;

const BILL_UNPAID = {
  _id: 'bill1',
  totalAmount: 1_000_000,
  paidAmount: 0,
  status: BillStatus.UNPAID,
  save: jest.fn().mockResolvedValue(undefined),
};

const BILL_PARTIAL = {
  _id: 'bill1',
  totalAmount: 1_000_000,
  paidAmount: 400_000,
  status: BillStatus.PARTIAL,
  save: jest.fn().mockResolvedValue(undefined),
};

const BILL_PAID = {
  _id: 'bill1',
  totalAmount: 1_000_000,
  paidAmount: 1_000_000,
  status: BillStatus.PAID,
  save: jest.fn().mockResolvedValue(undefined),
};

// ── Test suite ───────────────────────────────────────────────────────────────

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentModel: jest.Mocked<any>;
  let billModel: jest.Mocked<any>;
  let connection: jest.Mocked<any>;
  let mailService: jest.Mocked<any>;

  beforeEach(async () => {
    const session = makeSession();

    paymentModel = {
      create: jest.fn(),
      aggregate: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    billModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
    };

    connection = {
      startSession: jest.fn().mockResolvedValue(session),
    };

    mailService = {
      sendPaymentConfirmation: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getModelToken(Payment.name), useValue: paymentModel },
        { provide: getModelToken(Bill.name), useValue: billModel },
        { provide: getModelToken(Contract.name), useValue: { findById: jest.fn() } },
        { provide: getModelToken(Tenant.name), useValue: { findById: jest.fn() } },
        { provide: getConnectionToken(), useValue: connection },
        { provide: 'MailService', useValue: mailService },
      ],
    })
      .overrideProvider('MailService')
      .useValue(mailService)
      .compile();

    service = module.get<PaymentsService>(PaymentsService);
    // Inject mail service via reflection since it's not a token
    (service as any).mailService = mailService;
  });

  afterEach(() => jest.clearAllMocks());

  // ── create() ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    const DTO = { billId: 'bill1', amount: 500_000, method: 'CASH' } as any;

    it('creates payment and correctly increases paidAmount to PARTIAL', async () => {
      const mockBill = { ...BILL_UNPAID };
      mockBill.save = jest.fn().mockResolvedValue(undefined);
      billModel.findOne.mockReturnValue(makeQuery(mockBill));

      const mockPayment = { _id: 'pay1', amount: 500_000, billId: 'bill1' };
      paymentModel.create.mockResolvedValue([mockPayment]);
      paymentModel.aggregate.mockReturnValue(makeAggregateQuery([{ _id: null, total: 500_000 }]));

      const result = await service.create(DTO, USER);

      expect(result).toEqual(mockPayment);
      expect(mockBill.paidAmount).toBe(500_000);
      expect(mockBill.status).toBe(BillStatus.PARTIAL);
      expect(mockBill.save).toHaveBeenCalled();
    });

    it('sets bill status to PAID when payment covers full amount', async () => {
      const mockBill = { ...BILL_UNPAID };
      mockBill.save = jest.fn().mockResolvedValue(undefined);
      billModel.findOne.mockReturnValue(makeQuery(mockBill));

      paymentModel.create.mockResolvedValue([{ _id: 'pay2', amount: 1_000_000 }]);
      paymentModel.aggregate.mockReturnValue(makeAggregateQuery([{ _id: null, total: 1_000_000 }]));

      await service.create({ billId: 'bill1', amount: 1_000_000, method: 'CASH' } as any, USER);

      expect(mockBill.status).toBe(BillStatus.PAID);
      expect(mockBill.paidAmount).toBe(1_000_000);
    });

    it('throws NotFoundException when bill not found', async () => {
      billModel.findOne.mockReturnValue(makeQuery(null));

      await expect(service.create(DTO, USER)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when bill is already PAID', async () => {
      billModel.findOne.mockReturnValue(makeQuery({ ...BILL_PAID }));

      await expect(service.create(DTO, USER)).rejects.toThrow(BadRequestException);
      await expect(service.create(DTO, USER)).rejects.toThrow('already fully paid');
    });

    it('throws BadRequestException when amount exceeds remaining balance', async () => {
      // Bill has 400k remaining (1000k total, 600k paid)
      const mockBill = { ...BILL_PARTIAL }; // paidAmount=400k, so remaining=600k
      mockBill.save = jest.fn().mockResolvedValue(undefined);
      billModel.findOne.mockReturnValue(makeQuery(mockBill));

      const overDto = { billId: 'bill1', amount: 700_000, method: 'CASH' } as any;
      await expect(service.create(overDto, USER)).rejects.toThrow(BadRequestException);
      await expect(service.create(overDto, USER)).rejects.toThrow('exceeds remaining balance');
    });

    it('aborts transaction and rethrows on unexpected error', async () => {
      billModel.findOne.mockReturnValue(makeQuery(null));

      const session = await connection.startSession();

      await expect(service.create(DTO, USER)).rejects.toThrow();
      expect(session.abortTransaction).toHaveBeenCalled();
    });
  });

  // ── remove() ───────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('throws NotFoundException when payment not found', async () => {
      paymentModel.findOne.mockReturnValue(makeQuery(null));

      await expect(service.remove('pay1', USER)).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes payment and recalculates bill to UNPAID when all payments removed', async () => {
      const mockPayment = {
        _id: 'pay1',
        billId: 'bill1',
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        save: jest.fn().mockResolvedValue(undefined),
      };
      paymentModel.findOne.mockReturnValue(makeQuery(mockPayment));
      paymentModel.aggregate.mockReturnValue(makeAggregateQuery([])); // no remaining payments

      const mockBill = {
        ...BILL_PARTIAL,
        save: jest.fn().mockResolvedValue(undefined),
      };
      billModel.findById.mockReturnValue(makeQuery(mockBill));

      const result = await service.remove('pay1', USER);

      expect(result.message).toContain('deleted');
      expect(mockBill.status).toBe(BillStatus.UNPAID);
      expect(mockBill.paidAmount).toBe(0);
    });
  });
});
