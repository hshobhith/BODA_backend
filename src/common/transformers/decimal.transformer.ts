import { ValueTransformer } from 'typeorm';

/**
 * TypeORM stores `numeric`/`decimal` columns as strings to avoid floating point
 * precision loss. This transformer converts them to JS numbers on read and
 * passes values through unchanged on write, so entities always expose `number`.
 * Use on money fields (`numeric(10,2)`) and lat/lng decimal columns alike.
 */
export const DecimalColumnTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : parseFloat(value)),
};
