import { Module } from '@nestjs/common';
import { TagsController } from './tags.controller.js';
import { TagsService } from './tags.service.js';

@Module({
  controllers: [TagsController],
  providers: [TagsService],
  // Transactions name their tags, making new ones.
  exports: [TagsService],
})
export class TagsModule {}
