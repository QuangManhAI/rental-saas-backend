import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/users.schema';
import { UserPayload } from '../../shared/types';

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async completeOnboarding(user: UserPayload): Promise<{ message: string; isOnboardingComplete: boolean }> {
    const updated = await this.userModel.findByIdAndUpdate(
      new Types.ObjectId(user.userId),
      { isOnboardingComplete: true },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    return { message: 'Onboarding completed', isOnboardingComplete: true };
  }

  async getOnboardingStatus(userId: string): Promise<{ isOnboardingComplete: boolean; emailVerified: boolean }> {
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException('User not found');
    return {
      isOnboardingComplete: user.isOnboardingComplete ?? false,
      emailVerified: user.emailVerified ?? false,
    };
  }
}
