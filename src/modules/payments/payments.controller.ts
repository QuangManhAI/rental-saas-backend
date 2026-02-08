import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: UserPayload) {
    return this.paymentsService.create(dto, user);
  }

  @Get('bill/:billId')
  findAllByBill(
    @Param('billId', ParseObjectIdPipe) billId: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.paymentsService.findAllByBill(billId, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.paymentsService.remove(id, user);
  }
}
