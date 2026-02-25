import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { BankAccountsController, BillQrController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';
import { BankAccount, BankAccountSchema } from './bank-account.schema';
import { Bill, BillSchema } from '../bills/bills.schema';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';

@Module({
  imports: [
    PassportModule,
    MongooseModule.forFeature([
      { name: BankAccount.name, schema: BankAccountSchema },
      { name: Bill.name, schema: BillSchema },
    ]),
    TenantAuthModule, // Provides TenantJwtStrategy
  ],
  controllers: [BankAccountsController, BillQrController],
  providers: [BankAccountsService],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
