import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { SoftDeletableEntity } from '../../../database/base.entity';

@Entity('categories')
// Deleted categories keep their row, so a new category may reuse their slug.
@Index('UQ_categories_active_slug', ['slug'], { unique: true, where: `"deletedAt" IS NULL` })
export class Category extends SoftDeletableEntity {
  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  slug: string;

  @Column({ type: 'varchar', nullable: true })
  imageUrl?: string | null;

  @ManyToOne(() => Category, (category) => category.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parentId' })
  parent?: Category | null;

  @Column({ type: 'uuid', nullable: true })
  parentId?: string | null;

  @OneToMany(() => Category, (category) => category.parent)
  children: Category[];

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
