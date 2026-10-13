import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type Goal,
  type GoalInputDto,
  goalInputSchema,
  goalListSchema,
  goalSchema,
} from '@kopilka/shared';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiErrorResponses } from '../common/openapi/api-error-responses.decorator.js';
import { GoalsService } from './goals.service.js';

@ApiTags('goals')
@ApiErrorResponses(401)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  @ApiOperation({
    summary: 'Saving goals with their progress',
    description:
      'What is saved is the balance of the account each goal counts; the monthly amount is what makes the date.',
  })
  @ApiOkResponse({ standardSchema: goalListSchema })
  list(@CurrentUser() user: AuthUser): Promise<Goal[]> {
    return this.goals.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Start saving on an account' })
  @ApiCreatedResponse({ standardSchema: goalSchema })
  @ApiErrorResponses(400, 409)
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: goalInputSchema }) dto: GoalInputDto,
  ): Promise<Goal> {
    return this.goals.create(user.id, dto);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Replace a goal',
    description: 'The account it counts may change with it.',
  })
  @ApiOkResponse({ standardSchema: goalSchema })
  @ApiErrorResponses(400, 404, 409)
  replace(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: goalInputSchema }) dto: GoalInputDto,
  ): Promise<Goal> {
    return this.goals.replace(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Give up a goal',
    description: 'The account and its money stay as they are.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.goals.remove(user.id, id);
  }
}
