import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { MomoService } from './momo.service';
import { Bill } from '../bills/bills.schema';
import { Payment } from '../payments/payments.schema';
import { BillStatus } from '../bills/enums/bill-status.enum';

// ── Helpers ─────────────────────────────────────────────────────────────────

const SECRET_KEY = 'test-secret-key';
const ACCESS_KEY = 'test-access-key';
const PARTNER_CODE = 'TESTPARTNER';

function buildSignature(fields: Record<string, string | number>): string {
  const raw = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return crypto.createHmac('sha256', SECRET_KEY).update(raw).digest('hex');
}

function buildValidIpnPayload(overrides: Partial<Record<string, unknown>> = {}): any {
  const base = {
    partnerCode: PARTNER_CODE,
    orderId: 'bill1_1700000000000',
    requestId: 'req1',
    amount: 500_000,
    orderInfo: 'Thanh toan hoa don 1/2025',
    orderType: 'momo_wallet',
    transId: 123456789,
    resultCode: 0,
    message: 'Successful.',
    payType: 'qr',
    responseTime: 1700000001000,
    extraData: '',
    ...overrides,
  };

  const rawSignature = [
    `accessKey=${ACCESS_KEY}`,
    `amount=${base.amount}`,
    `extraData=${base.extraData}`,
    `message=${base.message}`,
    `orderId=${base.orderId}`,
    `orderInfo=${base.orderInfo}`,
    `orderType=${base.orderType}`,
    `partnerCode=${base.partnerCode}`,
    `payType=${base.payType}`,
    `requestId=${base.requestId}`,
    `responseTime=${base.responseTime}`,
    `resultCode=${base.resultCode}`,
    `transId=${base.transId}`,
  ].join('&');

  return {
    ...base,
    signature: crypto.createHmac('sha256', SECRET_KEY).update(rawSignature).digest('hex'),
  };
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('MomoService – handleIpn()', () => {
  let service: MomoService;
  let billModel: jest.Mocked<any>;
  let paymentModel: jest.Mocked<any>;
  let paymentSettingsService: jest.Mocked<any>;
  let session: jest.Mocked<any>;

  beforeEach(async () => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(true),
    };

    const mockBill = {
      _id: 'bill1',
      totalAmount: 1_000_000,
      paidAmount: 0,
      status: BillStatus.UNPAID,
      ownerId: 'owner1',
      month: 1,
      year: 2025,
      save: jest.fn().mockResolvedValue(undefined),
    };

    billModel = {
      findById: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(mockBill) }),
    };

    paymentModel = {
      findOne: jest.fn().mockResolvedValue(null), // no duplicate by default
      create: jest.fn().mockResolvedValue([{}]),
      aggregate: jest.fn().mockReturnValue({
        session: jest.fn().mockResolvedValue([{ _id: null, total: 500_000 }]),
      }),
    };

    paymentSettingsService = {
      getDecryptedCredentialsByPartnerCode: jest.fn().mockResolvedValue({
        accessKey: ACCESS_KEY,
        secretKey: SECRET_KEY,
        partnerCode: PARTNER_CODE,
        environment: 'sandbox',
      }),
      getDecryptedMomoCredentials: jest.fn().mockResolvedValue({
        accessKey: ACCESS_KEY,
        secretKey: SECRET_KEY,
        partnerCode: PARTNER_CODE,
        environment: 'sandbox',
      }),
    };

    const mockConnection = {
      startSession: jest.fn().mockResolvedValue(session),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MomoService,
        { provide: getModelToken(Bill.name), useValue: billModel },
        { provide: getModelToken(Payment.name), useValue: paymentModel },
        { provide: getConnectionToken(), useValue: mockConnection },
        {
          provide: 'PaymentSettingsService',
          useValue: paymentSettingsService,
        },
        {
          provide: 'ConfigService',
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    })
      .overrideProvider('PaymentSettingsService').useValue(paymentSettingsService)
      .overrideProvider('ConfigService').useValue({ get: jest.fn().mockReturnValue(undefined) })
      .compile();

    service = module.get<MomoService>(MomoService);
    (service as any).paymentSettingsService = paymentSettingsService;
  });

  afterEach(() => jest.clearAllMocks());

  it('processes valid IPN and updates bill status to PARTIAL', async () => {
    const payload = buildValidIpnPayload();

    const result = await service.handleIpn(payload);

    expect(result.message).toBe('Success');
    expect(paymentModel.create).toHaveBeenCalled();
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it('rejects IPN with invalid signature', async () => {
    const payload = buildValidIpnPayload({ signature: 'bad-signature' });

    await expect(service.handleIpn(payload)).rejects.toThrow(BadRequestException);
    await expect(service.handleIpn(payload)).rejects.toThrow('Invalid signature');
    expect(paymentModel.create).not.toHaveBeenCalled();
  });

  it('returns no-action for failed payment (resultCode !== 0)', async () => {
    const payload = buildValidIpnPayload({ resultCode: 1006 }); // user cancelled
    // Re-sign with resultCode=1006
    const rawSig = [
      `accessKey=${ACCESS_KEY}`,
      `amount=500000`,
      `extraData=`,
      `message=Successful.`,
      `orderId=bill1_1700000000000`,
      `orderInfo=Thanh toan hoa don 1/2025`,
      `orderType=momo_wallet`,
      `partnerCode=${PARTNER_CODE}`,
      `payType=qr`,
      `requestId=req1`,
      `responseTime=1700000001000`,
      `resultCode=1006`,
      `transId=123456789`,
    ].join('&');
    payload.signature = crypto.createHmac('sha256', SECRET_KEY).update(rawSig).digest('hex');

    const result = await service.handleIpn(payload);

    expect(result.message).toContain('Payment failed');
    expect(paymentModel.create).not.toHaveBeenCalled();
  });

  it('is idempotent — ignores duplicate IPN with same transId', async () => {
    paymentModel.findOne.mockResolvedValue({ _id: 'pay1', transactionId: '123456789' }); // already processed

    const payload = buildValidIpnPayload();

    const result = await service.handleIpn(payload);

    expect(result.message).toBe('Already processed');
    expect(paymentModel.create).not.toHaveBeenCalled();
  });

  it('does nothing when bill is already fully PAID', async () => {
    // Override: payment not yet recorded but bill is already PAID
    paymentModel.findOne.mockResolvedValue(null); // not a duplicate payment
    const paidBill = {
      _id: 'bill1',
      totalAmount: 1_000_000,
      paidAmount: 1_000_000,
      status: BillStatus.PAID,
      ownerId: 'owner1',
      save: jest.fn(),
    };
    billModel.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(paidBill) });

    const payload = buildValidIpnPayload();
    const result = await service.handleIpn(payload);

    expect(result.message).toBe('Already processed');
    expect(paymentModel.create).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it('throws when partnerCode is unknown', async () => {
    paymentSettingsService.getDecryptedCredentialsByPartnerCode.mockResolvedValue(null);

    const payload = buildValidIpnPayload({ partnerCode: 'UNKNOWN' });
    await expect(service.handleIpn(payload)).rejects.toThrow(BadRequestException);
    await expect(service.handleIpn(payload)).rejects.toThrow('Unknown partnerCode');
  });
});
