import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListUsersDto {
  @IsInt() @Min(1) @Type(() => Number) @IsOptional()
  page: number = 1;

  @IsInt() @Min(1) @Type(() => Number) @IsOptional()
  limit: number = 10;

  @IsString() @IsOptional()
  search?: string;
}
