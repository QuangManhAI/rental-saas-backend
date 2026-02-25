import {
  Controller, Get, Post, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SubscriptionService } from './subscription.service';
import { ActivatePlanDto } from './dto/activate-plan.dto';
import { RequestUpgradeDto } from './dto/request-upgrade.dto';
import { PLAN_LIMITS, SubscriptionPlan } from './subscription.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserPayload } from '../../shared/types';
import { Role } from '../../common/enums/role.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
@SkipThrottle()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // ── Public / Owner endpoints ──────────────────────────────────────────────────

  @Get('plans')
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
  getMySubscription(@CurrentUser() user: UserPayload) {
    return this.subscriptionService.getMySubscription(user.ownerId);
  }

  @Get('usage')
  getUsage(@CurrentUser() user: UserPayload) {
    return this.subscriptionService.getUsage(user.ownerId);
  }

  @Post('request-upgrade')
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

  @Get('payment-history')
  getPaymentHistory(@CurrentUser() user: UserPayload) {
    return this.subscriptionService.getPaymentHistory(user.ownerId);
  }

  // ── Admin endpoints ──────────────────────────────────────────────────────────

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findAll(@Query() query: PaginationDto) {
    return this.subscriptionService.findAll(query);
  }

  @Get('owner/:ownerId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findByOwner(@Param('ownerId') ownerId: string) {
    return this.subscriptionService.findByOwner(ownerId);
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  activate(@Body() dto: ActivatePlanDto) {
    return this.subscriptionService.activatePlan(dto.ownerId, dto.plan, dto.months, dto.notes);
  }
}
