import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@Controller('contracts')
@UseGuards(JwtAuthGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post()
  create(@Body() dto: CreateContractDto, @CurrentUser() user: UserPayload) {
    return this.contractsService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: UserPayload) {
    return this.contractsService.findAll(user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.contractsService.findOne(id, user);
  }

  @Patch(':id/terminate')
  terminate(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.contractsService.terminate(id, user);
  }
}
