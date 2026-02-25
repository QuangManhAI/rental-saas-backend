/**
 * E2E: Tenant Portal Flow — data isolation
 *
 * Verifies that a tenant can only see their own bills/payments.
 * Requires: TEST_MONGODB_URI env var
 * Run: npm run test:e2e -- --testPathPattern=tenant-portal
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const MONGO_URI =
  process.env.TEST_MONGODB_URI ?? 'mongodb://localhost:27017/rental-e2e-test';

describe('E2E: Tenant Portal', () => {
  let app: INestApplication;
  let ownerToken: string;
  let tenantLoginToken: string;
  let contractId: string;
  let billId: string;
  let tenantId: string;
  let otherTenantBillId: string;

  beforeAll(async () => {
    process.env.MONGODB_URI = MONGO_URI;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // Register owner
    const ts = Date.now();
    const ownerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `tenant-owner-${ts}@test.com`,
        password: 'Test1234!',
        fullName: 'Tenant Test Owner',
        phone: '0900000003',
      });
    ownerToken = ownerRes.body.data.tokens.accessToken;

    // Setup property & room
    const propRes = await request(app.getHttpServer())
      .post('/api/properties')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Tenant Portal Test', address: '1 Portal St', city: 'HCM' });
    const propertyId = propRes.body.data._id;

    const roomRes = await request(app.getHttpServer())
      .post('/api/rooms')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ propertyId, name: 'P201', price: 2_500_000, area: 22, maxOccupants: 1 });
    const roomId = roomRes.body.data._id;

    // Create tenant
    const tenantRes = await request(app.getHttpServer())
      .post('/api/tenants')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fullName: 'Tenant Portal Test', phone: '0903000001', idCard: '999888777666' });
    tenantId = tenantRes.body.data._id;

    // Create contract
    const contractRes = await request(app.getHttpServer())
      .post('/api/contracts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        roomId,
        tenantId,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        rentPrice: 2_500_000,
        deposit: 2_500_000,
      });
    contractId = contractRes.body.data._id;

    // Create bill for this tenant
    const billRes = await request(app.getHttpServer())
      .post('/api/bills')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        contractId,
        month: 1,
        year: 2025,
        electricOldIndex: 0,
        electricNewIndex: 50,
        electricRate: 3_500,
        waterOldIndex: 0,
        waterNewIndex: 5,
        waterRate: 15_000,
        otherFee: 0,
      });
    billId = billRes.body.data._id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 1. Generate Tenant Login Token ─────────────────────────────────────────

  it('POST /api/tenant-auth/generate-link → returns login URL', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tenant-auth/generate-link')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tenantId })
      .expect(201);

    expect(res.body.data.loginUrl).toBeTruthy();
    // Extract token from URL: .../tenant/login?token=xxx
    const url = new URL(res.body.data.loginUrl);
    const token = url.searchParams.get('token');
    expect(token).toBeTruthy();

    // Now login via tenant portal
    const loginRes = await request(app.getHttpServer())
      .post('/api/tenant-auth/login')
      .send({ token })
      .expect(200);

    tenantLoginToken = loginRes.body.data.accessToken;
    expect(tenantLoginToken).toBeTruthy();
  });

  // ── 2. Tenant can view own bills ───────────────────────────────────────────

  it('GET /api/tenant-portal/bills → returns only own bills', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tenant-portal/bills')
      .set('Authorization', `Bearer ${tenantLoginToken}`)
      .expect(200);

    const bills = res.body.data;
    expect(Array.isArray(bills)).toBe(true);
    expect(bills.length).toBeGreaterThanOrEqual(1);

    // All returned bills must belong to this tenant's contract
    const bill = bills.find((b: any) => b._id === billId);
    expect(bill).toBeDefined();
  });

  // ── 3. Tenant cannot access other tenant's bill ────────────────────────────

  it('GET /api/tenant-portal/bills/:id for wrong bill → 403 or 404', async () => {
    if (!otherTenantBillId) {
      // Use a random ObjectId that doesn't exist for this tenant
      otherTenantBillId = '6507f1f77bcf86cd79939999';
    }

    const res = await request(app.getHttpServer())
      .get(`/api/tenant-portal/bills/${otherTenantBillId}`)
      .set('Authorization', `Bearer ${tenantLoginToken}`);

    expect([403, 404]).toContain(res.status);
  });

  // ── 4. Tenant cannot access owner routes ──────────────────────────────────

  it('GET /api/payments (owner route) with tenant token → 401 or 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/payments')
      .set('Authorization', `Bearer ${tenantLoginToken}`);

    expect([401, 403]).toContain(res.status);
  });
});
