import { Transform } from 'class-transformer';
import { IsArray, ArrayNotEmpty, IsString, Matches } from 'class-validator';

export class DeleteManyDto {
  @Transform(({ value }) => {
    const asArray = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,\s]+/)
        : [];

    const cleaned = asArray
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);

    return Array.from(new Set(cleaned));
  })
  @IsArray({ message: 'A lista de IDs deve ser um array.' })
  @ArrayNotEmpty({ message: 'A lista de IDs não pode estar vazia.' })
  @IsString({ each: true, message: 'Cada ID na lista deve ser uma string.' })
  @Matches(/^[cC][a-z0-9]{24}$/, {
    each: true,
    message: 'Cada ID deve ser um CUID válido (25 chars, iniciando com "c").',
  })
  ids!: string[];
}
