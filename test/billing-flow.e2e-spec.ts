/**
 * E2E: Full Billing Flow
 *
 * Requires: TEST_MONGODB_URI env var
 * Run: npm run test:e2e -- --testPathPattern=billing-flow
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const MONGO_URI =
  process.env.TEST_MONGODB_URI ?? 'mongodb://localhost:27017/rental-e2e-test';

describe('E2E: Billing Flow', () => {
  let app: INestApplication;
  let accessToken: string;
  let propertyId: string;
  let roomId: string;
  let tenantId: string;
  let contractId: string;
  let billId: string;

  beforeAll(async () => {
    process.env.MONGODB_URI = MONGO_URI;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // Set up: register owner, create property, room, tenant, contract
    const regRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `billing-${Date.now()}@test.com`,
        password: 'Test1234!',
        fullName: 'Billing Owner',
        phone: '0900000002',
      });
    accessToken = regRes.body.data.tokens.accessToken;

    const propRes = await request(app.getHttpServer())
      .post('/api/properties')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Test Property', address: '1 Test St', city: 'Hanoi' });
    propertyId = propRes.body.data._id;

    const roomRes = await request(app.getHttpServer())
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ propertyId, name: 'P102', price: 2_000_000, area: 20, maxOccupants: 1 });
    roomId = roomRes.body.data._id;

    const tenantRes = await request(app.getHttpServer())
      .post('/api/tenants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Billing Tenant', phone: '0902000000', idCard: '111222333444' });
    tenantId = tenantRes.body.data._id;

    const contractRes = await request(app.getHttpServer())
      .post('/api/contracts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        roomId,
        tenantId,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        rentPrice: 2_000_000,
        deposit: 2_000_000,
      });
    contractId = contractRes.body.data._id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 1. Create Bill ─────────────────────────────────────────────────────────

  it('POST /api/bills → 201 with correct total calculation', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/bills')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        contractId,
        month: 1,
        year: 2025,
        electricOldIndex: 100,
        electricNewIndex: 150,  // 50 kWh
        electricRate: 3_500,    // = 175_000
        waterOldIndex: 10,
        waterNewIndex: 15,      // 5 m³
        waterRate: 15_000,      // = 75_000
        otherFee: 50_000,
      })
      .expect(201);

    billId = res.body.data._id;
    const bill = res.body.data;

    // rent=2_000_000 + electric=175_000 + water=75_000 + other=50_000 = 2_300_000
    expect(bill.totalAmount).toBe(2_300_000);
    expect(bill.paidAmount).toBe(0);
    expect(bill.status).toBe('UNPAID');
  });

  // ── 2. Record Partial Payment ─────────────────────────────────────────────

  it('POST /api/payments → bill status becomes PARTIAL', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        billId,
        amount: 1_000_000,
        method: 'CASH',
      })
      .expect(201);

    expect(res.body.data.amount).toBe(1_000_000);

    // Verify bill is now PARTIAL
    const billRes = await request(app.getHttpServer())
      .get(`/api/bills/${billId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(billRes.body.data.status).toBe('PARTIAL');
    expect(billRes.body.data.paidAmount).toBe(1_000_000);
  });

  // ── 3. Prevent Overpayment ─────────────────────────────────────────────────

  it('POST /api/payments with amount > remaining → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        billId,
        amount: 2_000_000, // remaining is only 1_300_000
        method: 'TRANSFER',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('remaining');
  });

  // ── 4. Record Remaining Payment ────────────────────────────────────────────

  it('POST /api/payments (remaining) → bill status becomes PAID', async () => {
    await request(app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        billId,
        amount: 1_300_000, // pays remaining exactly
        method: 'TRANSFER',
      })
      .expect(201);

    // Verify bill is now PAID
    const billRes = await request(app.getHttpServer())
      .get(`/api/bills/${billId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(billRes.body.data.status).toBe('PAID');
    expect(billRes.body.data.paidAmount).toBe(2_300_000);
  });

  // ── 5. Prevent Payment on Already-Paid Bill ────────────────────────────────

  it('POST /api/payments on PAID bill → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ billId, amount: 100_000, method: 'CASH' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('already fully paid');
  });
});
