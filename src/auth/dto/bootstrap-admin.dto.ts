import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class BootstrapAdminDto {
  @IsString()
  @IsNotEmpty({ message: 'corretorId é obrigatório' })
  @Length(8, 64, { message: 'corretorId inválido' }) // cuid (não é UUID)
  corretorId!: string;

  @IsString()
  @IsNotEmpty({ message: 'name é obrigatório' })
  @Length(3, 100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsEmail({}, { message: 'email inválido' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'password é obrigatório' })
  @Length(8, 72, { message: 'password deve ter entre 8 e 72 caracteres' })
  password!: string;
}
