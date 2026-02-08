import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserPayload } from '../../shared/types';

export const CurrentUser = createParamDecorator(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: UserPayload }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
