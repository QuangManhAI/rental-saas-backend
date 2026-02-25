/**
 * E2E: Full Booking Flow
 *
 * Requires: TEST_MONGODB_URI env var (or defaults to mongodb://localhost:27017/rental-test)
 * Run: npm run test:e2e -- --testPathPattern=booking-flow
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const MONGO_URI =
  process.env.TEST_MONGODB_URI ?? 'mongodb://localhost:27017/rental-e2e-test';

const OWNER = {
  email: `e2e-owner-${Date.now()}@test.com`,
  password: 'Test1234!',
  fullName: 'E2E Owner',
  phone: '0900000001',
};

describe('E2E: Booking Flow', () => {
  let app: INestApplication;
  let accessToken: string;
  let propertyId: string;
  let roomId: string;
  let tenantId: string;
  let contractId: string;

  beforeAll(async () => {
    // Override MongoDB URI for tests
    process.env.MONGODB_URI = MONGO_URI;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 1. Register & Login ────────────────────────────────────────────────────

  it('POST /api/auth/register → 201 with tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(OWNER)
      .expect(201);

    expect(res.body.data.tokens.accessToken).toBeTruthy();
    accessToken = res.body.data.tokens.accessToken;
  });

  // ── 2. Create Property ────────────────────────────────────────────────────

  it('POST /api/properties → 201 with property', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/properties')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Nhà trọ E2E',
        address: '123 Đường Test, Quận 1',
        city: 'Hồ Chí Minh',
      })
      .expect(201);

    expect(res.body.data._id).toBeTruthy();
    propertyId = res.body.data._id;
  });

  // ── 3. Create Room ────────────────────────────────────────────────────────

  it('POST /api/rooms → 201 with status AVAILABLE', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/rooms')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        propertyId,
        name: 'Phòng 101',
        price: 3_000_000,
        area: 25,
        maxOccupants: 2,
      })
      .expect(201);

    expect(res.body.data.status).toBe('AVAILABLE');
    roomId = res.body.data._id;
  });

  // ── 4. Create Tenant ──────────────────────────────────────────────────────

  it('POST /api/tenants → 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tenants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fullName: 'Khách thuê E2E',
        phone: '0901234567',
        idCard: '123456789012',
      })
      .expect(201);

    tenantId = res.body.data._id;
    expect(tenantId).toBeTruthy();
  });

  // ── 5. Create Contract → Room becomes OCCUPIED ────────────────────────────

  it('POST /api/contracts → 201 and room status becomes OCCUPIED', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/contracts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        roomId,
        tenantId,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        rentPrice: 3_000_000,
        deposit: 3_000_000,
      })
      .expect(201);

    contractId = res.body.data._id;
    expect(contractId).toBeTruthy();

    // Verify room is now OCCUPIED
    const roomRes = await request(app.getHttpServer())
      .get(`/api/rooms/${roomId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(roomRes.body.data.status).toBe('OCCUPIED');
  });

  // ── 6. Double-booking → ConflictException ────────────────────────────────

  it('POST /api/contracts with same room → 400 (double booking prevented)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/contracts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        roomId,
        tenantId,
        startDate: '2025-02-01',
        endDate: '2025-12-31',
        rentPrice: 3_000_000,
        deposit: 3_000_000,
      });

    expect(res.status).toBe(400);
  });

  // ── 7. Terminate Contract → Room becomes AVAILABLE ────────────────────────

  it('PATCH /api/contracts/:id/terminate → room back to AVAILABLE', async () => {
    await request(app.getHttpServer())
      .patch(`/api/contracts/${contractId}/terminate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const roomRes = await request(app.getHttpServer())
      .get(`/api/rooms/${roomId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(roomRes.body.data.status).toBe('AVAILABLE');
  });
});
