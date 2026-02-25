import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'required_feature';

/** Use on a route handler to require a subscription feature. Enforced by FeatureGuard. */
export const RequireFeature = (feature: string) => SetMetadata(FEATURE_KEY, feature);
