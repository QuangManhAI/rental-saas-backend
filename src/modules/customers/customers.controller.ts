import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Body() createCustomerDto: CreateCustomerDto, @CurrentUser() user: UserPayload) {
    return this.customersService.create(createCustomerDto, user.ownerId);
  }

  @Get()
  findAll(@CurrentUser() user: UserPayload) {
    return this.customersService.findAll(user.ownerId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.customersService.findOne(id, user.ownerId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.customersService.update(id, updateCustomerDto, user.ownerId);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.customersService.remove(id, user.ownerId);
  }

  @Get(':id/telegram-link')
  getTelegramLink(@Param('id') id: string) {
    return {
      url: `https://t.me/quangManhAI_bot?start=${id}`,
    };
  }
}