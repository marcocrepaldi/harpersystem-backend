import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class PresignDto {
  @IsString() @IsNotEmpty()
  filename!: string;

  @IsString() @IsNotEmpty()
  mimeType!: string;

  @IsInt() @Min(0)
  size!: number;

  // put | get
  @IsIn(['put', 'get'])
  @IsOptional()
  operation?: 'put' | 'get';
}
