import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nanoid } from 'nanoid';
import slugify from 'slugify';
import { PaginatedResult, paginate } from '../../common/utils/paginate.util';
import { Product } from '../products/entities/product.entity';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentId) {
      await this.findById(dto.parentId);
    }

    const slug = await this.generateUniqueSlug(dto.name);

    const category = this.categoriesRepository.create({
      ...dto,
      slug,
    });

    return this.categoriesRepository.save(category);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findById(id);

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new ConflictException('A category cannot be its own parent');
      }
      await this.findById(dto.parentId);
    }

    if (dto.name && dto.name !== category.name) {
      category.slug = await this.generateUniqueSlug(dto.name, id);
    }

    Object.assign(category, dto);

    return this.categoriesRepository.save(category);
  }

  async findBySlug(slug: string): Promise<Category | null> {
    return this.categoriesRepository.findOne({ where: { slug, isActive: true } });
  }

  async findById(id: string): Promise<Category> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category ${id} not found`);
    }
    return category;
  }

  async remove(id: string): Promise<void> {
    const category = await this.findById(id);

    const childCount = await this.categoriesRepository.count({
      where: { parentId: category.id },
    });
    if (childCount > 0) {
      throw new ConflictException(
        'Cannot delete a category that has child categories',
      );
    }

    // The products.categoryId foreign key used to refuse this; a soft delete
    // doesn't trip it, so check here. Archived products count too, as before.
    const productCount = await this.categoriesRepository.manager.count(Product, {
      where: { categoryId: category.id },
    });
    if (productCount > 0) {
      throw new ConflictException(
        `Cannot delete a category that ${productCount} product(s) still use. Move them to another category first.`,
      );
    }

    await this.categoriesRepository.softRemove(category);
  }

  async findTree(): Promise<CategoryTreeNode[]> {
    const categories = await this.categoriesRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });

    const nodesById = new Map<string, CategoryTreeNode>();
    for (const category of categories) {
      nodesById.set(category.id, { ...category, children: [] } as CategoryTreeNode);
    }

    const roots: CategoryTreeNode[] = [];
    for (const category of categories) {
      const node = nodesById.get(category.id)!;
      if (category.parentId && nodesById.has(category.parentId)) {
        nodesById.get(category.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async findFlat(page: number, limit: number): Promise<PaginatedResult<Category>> {
    const [data, total] = await this.categoriesRepository.findAndCount({
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return paginate(data, total, page, limit);
  }

  private async generateUniqueSlug(name: string, ignoreId?: string): Promise<string> {
    const base = slugify(name, { lower: true, strict: true });
    let slug = base;
    let attempts = 0;

    while (true) {
      const existing = await this.categoriesRepository.findOne({ where: { slug } });
      if (!existing || existing.id === ignoreId) {
        break;
      }
      attempts += 1;
      slug = `${base}-${nanoid(6)}`;
      if (attempts > 5) {
        break;
      }
    }

    return slug;
  }
}
