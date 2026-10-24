import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Audit } from '../../common/decorators/audit.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuditLogInterceptor } from '../audit-log/audit-log.interceptor';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // -----------------------------------------------------------------
  // Public endpoints. `tree` must stay declared before `:id` so Nest
  // doesn't match it as an id lookup.
  // -----------------------------------------------------------------

  @Public()
  @Get('tree')
  @ApiOperation({ summary: 'Get all active categories as a nested tree (customer browse UI)' })
  @ApiResponse({ status: 200, description: 'Nested category tree, ordered by sortOrder' })
  async tree() {
    return this.categoriesService.findTree();
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get a flat paginated list of categories (admin management UI)' })
  @ApiResponse({ status: 200, description: 'Paginated list of categories' })
  async findAll(@Query() query: PaginationQueryDto) {
    return this.categoriesService.findFlat(query.page ?? 1, query.limit ?? 20);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a category by id' })
  @ApiResponse({ status: 200, description: 'The category' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findOne(@Param('id') id: string) {
    return this.categoriesService.findById(id);
  }

  // -----------------------------------------------------------------
  // Admin-only mutations
  // -----------------------------------------------------------------

  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(AuditLogInterceptor)
  @Audit('category.create', 'category')
  @Post()
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({ status: 201, description: 'Category created' })
  @ApiResponse({ status: 404, description: 'Parent category not found' })
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(AuditLogInterceptor)
  @Audit('category.update', 'category')
  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  @ApiResponse({ status: 404, description: 'Category or parent not found' })
  @ApiResponse({ status: 409, description: 'A category cannot be its own parent' })
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(AuditLogInterceptor)
  @Audit('category.delete', 'category')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category' })
  @ApiResponse({ status: 204, description: 'Category deleted' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Category has child categories' })
  async remove(@Param('id') id: string) {
    await this.categoriesService.remove(id);
  }
}
