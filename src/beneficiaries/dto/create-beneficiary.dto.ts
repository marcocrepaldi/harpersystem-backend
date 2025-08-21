import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumberString,
  IsUUID,
  Length,
} from 'class-validator';

enum BeneficiarioTipoDto {
  TITULAR = 'TITULAR',
  DEPENDENTE = 'DEPENDENTE',
}

// ✅ NOVO: Enum para o campo 'sexo'
enum SexoDto {
  M = 'M',
  F = 'F',
}

export class CreateBeneficiaryDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome completo é obrigatório.' })
  nomeCompleto: string;

  @IsString()
  @IsOptional()
  cpf?: string;

  @IsEnum(BeneficiarioTipoDto)
  @IsNotEmpty({ message: 'O tipo (Titular/Dependente) é obrigatório.' })
  tipo: BeneficiarioTipoDto;

  @IsDateString()
  @IsNotEmpty({ message: 'A data de entrada é obrigatória.' })
  dataEntrada: string;

  @IsOptional()
  @IsNumberString()
  valorMensalidade?: string;

  // Se for dependente, o ID do titular é obrigatório
  @IsOptional()
  @IsUUID('4', { message: 'O ID do titular deve ser um UUID válido.' })
  titularId?: string;
  
  // --- ✅ NOVOS CAMPOS ADICIONADOS ---

  @IsOptional()
  @IsString()
  matricula?: string;

  @IsOptional()
  @IsString()
  carteirinha?: string;

  @IsOptional()
  @IsEnum(SexoDto, { message: 'O sexo deve ser M ou F.'})
  @Length(1, 1)
  sexo?: SexoDto;

  @IsOptional()
  @IsDateString()
  dataNascimento?: string;

  @IsOptional()
  @IsString()
  plano?: string;

  @IsOptional()
  @IsString()
  centroCusto?: string;
}