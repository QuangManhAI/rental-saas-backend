import {
  Controller, Get, Post, Put, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, Version, VERSION_NEUTRAL,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { SubscriptionService } from './subscription.service';
import { ActivatePlanDto } from './dto/activate-plan.dto';
import { RequestUpgradeDto } from './dto/request-upgrade.dto';
import { UpsertPaymentSettingsDto } from '../payment-settings/dto/upsert-payment-settings.dto';
import { PLAN_LIMITS, SubscriptionPlan } from './subscription.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserPayload } from '../../shared/types';
import { Role } from '../../common/enums/role.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('subscriptions')
@SkipThrottle()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // ── Public / Owner endpoints ──────────────────────────────────────────────────

  @Get('plans')
  @UseGuards(JwtAuthGuard)
  getPlans() {
    return {
      plans: [
        {
          plan: SubscriptionPlan.FREE,
          name: 'Miễn phí',
          price: 0,
          ...PLAN_LIMITS[SubscriptionPlan.FREE],
          color: 'gray',
          icon: 'Sparkles',
        },
        {
          plan: SubscriptionPlan.BASIC,
          name: 'Cơ bản',
          price: 199000,
          ...PLAN_LIMITS[SubscriptionPlan.BASIC],
          color: 'blue',
          icon: 'Zap',
          popular: false,
        },
        {
          plan: SubscriptionPlan.PRO,
          name: 'Chuyên nghiệp',
          price: 499000,
          ...PLAN_LIMITS[SubscriptionPlan.PRO],
          color: 'purple',
          icon: 'Crown',
          popular: true,
        },
      ],
    };
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  getMySubscription(@CurrentUser() user: UserPayload) {
    return this.subscriptionService.getMySubscription(user.ownerId);
  }

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  getUsage(@CurrentUser() user: UserPayload) {
    return this.subscriptionService.getUsage(user.ownerId);
  }

  @Post('request-upgrade')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  requestUpgrade(@Body() dto: RequestUpgradeDto, @CurrentUser() user: UserPayload) {
    return this.subscriptionService.requestUpgrade(
      user.ownerId,
      dto.toPlan,
      dto.months,
      dto.paymentMethod,
      dto.notes,
    );
  }

  @Post('create-momo-payment')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  createMomoPayment(
    @Body() body: { toPlan: string; months: number },
    @CurrentUser() user: UserPayload,
  ) {
    return this.subscriptionService.createSubscriptionMomoPayment(
      user.ownerId,
      body.toPlan,
      body.months,
    );
  }

  @Get('payment-history')
  @UseGuards(JwtAuthGuard)
  getPaymentHistory(@CurrentUser() user: UserPayload) {
    return this.subscriptionService.getPaymentHistory(user.ownerId);
  }

  // ── MoMo IPN (public, no JWT — called by MoMo servers) ─────────────────────

  @Post('momo-ipn')
  @Version(VERSION_NEUTRAL)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  handleMomoIpn(@Body() payload: any) {
    return this.subscriptionService.handleSubscriptionMomoIpn(payload);
  }

  // ── Admin endpoints ──────────────────────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findAll(@Query() query: PaginationDto) {
    return this.subscriptionService.findAll(query);
  }

  @Get('admin-payment-settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getAdminPaymentSettings() {
    return this.subscriptionService.getAdminPaymentSettings();
  }

  @Get('owner/:ownerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findByOwner(@Param('ownerId') ownerId: string) {
    return this.subscriptionService.findByOwner(ownerId);
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  activate(@Body() dto: ActivatePlanDto) {
    return this.subscriptionService.activatePlan(dto.ownerId, dto.plan, dto.months, dto.notes);
  }

  @Put('admin-payment-settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  upsertAdminPaymentSettings(@Body() dto: UpsertPaymentSettingsDto) {
    return this.subscriptionService.upsertAdminPaymentSettings(dto);
  }
}
