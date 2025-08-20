// src/common/prisma-json.ts
import { Prisma } from '@prisma/client';

/**
 * Converte valores arbitrários para o tipo aceito pelos campos JSON do Prisma.
 * undefined => undefined (não altera)
 * null      => Prisma.JsonNull (grava JSON null)
 * objeto    => Prisma.InputJsonValue
 */
export function toJsonInput(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
