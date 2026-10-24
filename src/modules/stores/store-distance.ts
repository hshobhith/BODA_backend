/**
 * Haversine distance in km from the `:lat`/`:lng` parameters to the store
 * aliased `alias`, as a QueryBuilder expression (TypeORM translates the alias
 * to the quoted column). Store discovery and the public product listing both
 * filter on it, so a product is listed exactly where its store is.
 *
 * The `acos` argument is clamped to 1 because rounding can push it just past
 * 1 when the point sits on the store itself, which Postgres rejects as out of
 * range.
 */
export function storeDistanceKmSql(alias = 'store'): string {
  return `(6371 * acos(least(1, cos(radians(:lat)) * cos(radians(${alias}.lat)) * cos(radians(${alias}.lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(${alias}.lat)))))`;
}
