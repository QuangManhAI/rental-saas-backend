import { Controller, Post, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { SeedService } from './seed.service';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  /**
   * POST /api/seed
   * Seeds the database with realistic demo data.
   * WARNING: clears ALL existing data first.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async seed() {
    return this.seedService.seed();
  }

  /**
   * DELETE /api/seed
   * Clears ALL data from the database.
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async clear() {
    return this.seedService.clearAll();
  }
}
