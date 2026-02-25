import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionService } from '../../modules/subscription/subscription.service';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { UserPayload } from '../../shared/types';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeature) return true;

    const { user } = context.switchToHttp().getRequest<{ user: UserPayload }>();
    // checkFeature throws HTTP 402 if feature not available — let it propagate
    await this.subscriptionService.checkFeature(user.ownerId, requiredFeature);
    return true;
  }
}
