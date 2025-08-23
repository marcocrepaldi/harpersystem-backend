import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class DeleteManyDto {
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true, message: 'Cada ID na lista deve ser uma string.' })
  ids: string[];
}