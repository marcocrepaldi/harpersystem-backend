import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class DeleteManyDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'A lista de IDs não pode estar vazia.' })
  @IsString({ each: true, message: 'Cada ID na lista deve ser uma string.' })
  ids: string[];
}
