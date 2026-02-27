import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { SubscriptionService } from '../../subscription/subscription.service';

/**
 * Guard that checks if the owner's subscription includes the 'ai-agent' feature.
 * Throws 402/403 if the feature is not available.
 */
@Injectable()
export class AiAccessGuard implements CanActivate {
    constructor(private readonly subscriptionService: SubscriptionService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user?.ownerId) {
            throw new ForbiddenException('Authentication required');
        }

        // checkFeature throws HTTP 402 if the feature is not in the plan
        await this.subscriptionService.checkFeature(user.ownerId, 'ai-agent');
        return true;
    }
}
