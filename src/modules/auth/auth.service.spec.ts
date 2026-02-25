import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../users/users.schema';
import { RefreshToken } from './auth.schema';

jest.mock('bcrypt');

const MOCK_USER = {
  _id: { toString: () => 'u1' },
  email: 'test@example.com',
  fullName: 'Test User',
  password: '$hashed',
  role: 'owner',
  ownerId: { toString: () => 'u1' },
  isActive: true,
  emailVerified: false,
  emailVerificationToken: undefined as any,
  emailVerificationExpires: undefined as any,
  save: jest.fn().mockResolvedValue(undefined),
};

const MOCK_REFRESH_TOKEN = {
  token: 'refresh-abc',
  userId: 'u1',
  isRevoked: false,
  expiresAt: new Date(Date.now() + 86_400_000),
  save: jest.fn().mockResolvedValue(undefined),
};

describe('AuthService', () => {
  let service: AuthService;
  let userModel: jest.Mocked<any>;
  let refreshTokenModel: jest.Mocked<any>;
  let jwtService: jest.Mocked<any>;
  let configService: jest.Mocked<any>;
  let mailService: jest.Mocked<any>;
  let subscriptionService: jest.Mocked<any>;

  beforeEach(async () => {
    userModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };

    refreshTokenModel = {
      create: jest.fn().mockResolvedValue({}),
      findOne: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({}),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('access-token-xyz'),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string, fallback?: string) => {
        const map: Record<string, string> = {
          'jwt.secret': 'test-secret',
          'jwt.accessExpiresIn': '1d',
          'jwt.refreshExpiresIn': '7d',
          frontendUrl: 'http://localhost:3001',
        };
        return map[key] ?? fallback;
      }),
      getOrThrow: jest.fn().mockReturnValue('test-secret'),
    };

    mailService = {
      sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    };

    subscriptionService = {
      createFreeSubscription: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(RefreshToken.name), useValue: refreshTokenModel },
        { provide: 'JwtService', useValue: jwtService },
        { provide: 'ConfigService', useValue: configService },
        { provide: 'MailService', useValue: mailService },
        { provide: 'SubscriptionService', useValue: subscriptionService },
      ],
    })
      .overrideProvider('JwtService').useValue(jwtService)
      .overrideProvider('ConfigService').useValue(configService)
      .overrideProvider('MailService').useValue(mailService)
      .overrideProvider('SubscriptionService').useValue(subscriptionService)
      .compile();

    service = module.get<AuthService>(AuthService);
    // Inject via reflection since providers above use string tokens
    (service as any).jwtService = jwtService;
    (service as any).configService = configService;
    (service as any).mailService = mailService;
    (service as any).subscriptionService = subscriptionService;
  });

  afterEach(() => jest.clearAllMocks());

  // ── register() ─────────────────────────────────────────────────────────────

  describe('register()', () => {
    const DTO = { email: 'new@example.com', password: 'Pass1234!', fullName: 'New User', phone: '0900000000' } as any;

    it('hashes password and does NOT return it in response', async () => {
      userModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }); // email not taken

      const savedUser = {
        ...MOCK_USER,
        email: 'new@example.com',
        save: jest.fn().mockResolvedValue(undefined),
      };

      // Mock `new this.userModel(...)` behavior
      const userModelConstructor = jest.fn().mockReturnValue(savedUser);
      userModelConstructor.findOne = userModel.findOne;
      (service as any).userModel = userModelConstructor;

      (bcrypt.hash as jest.Mock).mockResolvedValue('$hashed-password');

      const result = await service.register(DTO);

      expect(result.user).not.toHaveProperty('password');
      expect(bcrypt.hash).toHaveBeenCalledWith(DTO.password, 12);
      expect(result.tokens.accessToken).toBeTruthy();
    });

    it('throws ConflictException when email already in use', async () => {
      userModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(MOCK_USER) });

      await expect(service.register(DTO)).rejects.toThrow(ConflictException);
      await expect(service.register(DTO)).rejects.toThrow('Email already in use');
    });
  });

  // ── login() ────────────────────────────────────────────────────────────────

  describe('login()', () => {
    const DTO = { email: 'test@example.com', password: 'Pass1234!' } as any;

    it('returns token pair on successful login', async () => {
      userModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(MOCK_USER) }),
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(DTO);

      expect(result.user.email).toBe(MOCK_USER.email);
      expect(result.tokens.accessToken).toBe('access-token-xyz');
      expect(result.user).not.toHaveProperty('password');
    });

    it('throws UnauthorizedException with wrong password', async () => {
      userModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(MOCK_USER) }),
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(DTO)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(DTO)).rejects.toThrow('Invalid credentials');
    });

    it('throws UnauthorizedException when user does not exist', async () => {
      userModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      });

      await expect(service.login(DTO)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when account is deactivated', async () => {
      userModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ ...MOCK_USER, isActive: false }),
        }),
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login(DTO)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(DTO)).rejects.toThrow('deactivated');
    });
  });

  // ── refreshTokens() ────────────────────────────────────────────────────────

  describe('refreshTokens()', () => {
    it('rotates refresh token — revokes old and issues new', async () => {
      refreshTokenModel.findOne.mockResolvedValue({ ...MOCK_REFRESH_TOKEN });
      userModel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(MOCK_USER) });

      const result = await service.refreshTokens('refresh-abc');

      expect(MOCK_REFRESH_TOKEN.save).toHaveBeenCalled(); // old token revoked
      expect(MOCK_REFRESH_TOKEN.isRevoked).toBe(true);
      expect(result.accessToken).toBeTruthy();
      expect(refreshTokenModel.create).toHaveBeenCalled(); // new refresh token created
    });

    it('throws UnauthorizedException for revoked/expired token', async () => {
      refreshTokenModel.findOne.mockResolvedValue(null);

      await expect(service.refreshTokens('bad-token')).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshTokens('bad-token')).rejects.toThrow('Invalid or expired');
    });
  });

  // ── logout() ───────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('revokes all active refresh tokens for the user', async () => {
      const result = await service.logout('u1');

      expect(refreshTokenModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ isRevoked: false }),
        { isRevoked: true },
      );
      expect(result.message).toContain('Logged out');
    });
  });

  // ── verifyEmail() ──────────────────────────────────────────────────────────

  describe('verifyEmail()', () => {
    it('marks email as verified and clears token', async () => {
      const mockUser = {
        emailVerified: false,
        emailVerificationToken: 'valid-token',
        emailVerificationExpires: new Date(Date.now() + 3600_000),
        save: jest.fn().mockResolvedValue(undefined),
      };
      userModel.findOne.mockResolvedValue(mockUser);

      const result = await service.verifyEmail('valid-token');

      expect(mockUser.emailVerified).toBe(true);
      expect(mockUser.emailVerificationToken).toBeUndefined();
      expect(result.message).toContain('xác thực thành công');
    });

    it('throws BadRequestException for invalid/expired token', async () => {
      userModel.findOne.mockResolvedValue(null);

      await expect(service.verifyEmail('bad-token')).rejects.toThrow(BadRequestException);
    });
  });
});
