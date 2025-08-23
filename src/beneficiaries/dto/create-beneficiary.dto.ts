import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsUUID,
  Matches,
  ValidateIf,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum BeneficiarioTipoDto { TITULAR = 'TITULAR', DEPENDENTE = 'DEPENDENTE' }
export enum SexoDto { M = 'M', F = 'F' }

/**
 * Regra de consistência:
 * - Se tipo = DEPENDENTE => titularId é obrigatório.
 * - Se tipo = TITULAR => titularId NÃO deve ser informado.
 */
@ValidatorConstraint({ name: 'TitularDependenteConsistency', async: false })
export class TitularDependenteConsistency implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const o = args.object as CreateBeneficiaryDto;

    if (o.tipo === BeneficiarioTipoDto.DEPENDENTE) {
      return typeof value === 'string' && value.length > 0;
    }
    if (o.tipo === BeneficiarioTipoDto.TITULAR) {
      return value === undefined || value === null || value === '';
    }
    return true;
  }
  defaultMessage(args: ValidationArguments): string {
    const o = args.object as CreateBeneficiaryDto;
    if (o.tipo === BeneficiarioTipoDto.DEPENDENTE) {
      return 'titularId é obrigatório quando tipo = DEPENDENTE.';
    }
    return 'titularId não deve ser informado quando tipo = TITULAR.';
  }
}

function trim(v: any) {
  return typeof v === 'string' ? v.trim() : v;
}

export class CreateBeneficiaryDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome completo é obrigatório.' })
  @Transform(({ value }) => trim(value))
  nomeCompleto!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '').trim() : value))
  @Matches(/^\d{11}$/, { message: 'CPF deve conter exatamente 11 dígitos numéricos.' })
  cpf?: string;

  @IsEnum(BeneficiarioTipoDto)
  @IsNotEmpty()
  tipo!: BeneficiarioTipoDto;

  @IsDateString()
  @IsNotEmpty()
  dataEntrada!: string; // ISO 8601 (ex: 2025-08-22)

  // Regra condicional em conjunto com o validador customizado acima
  @Validate(TitularDependenteConsistency)
  @ValidateIf((o) => o.tipo === BeneficiarioTipoDto.DEPENDENTE)
  @IsUUID('4', { message: 'titularId deve ser um UUID v4 válido.' })
  titularId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  matricula?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  carteirinha?: string;

  @IsOptional()
  @IsEnum(SexoDto)
  sexo?: SexoDto;

  @IsOptional()
  @IsDateString()
  dataNascimento?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  plano?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  centroCusto?: string;

  /**
   * Aceita "1234.56" ou "1234,56". Normaliza para ponto.
   * Se no Prisma você usa Decimal como string, manter assim é ok.
   */
  @IsOptional()
  @Matches(/^\d+([.,]\d{1,2})?$/, {
    message: 'valorMensalidade deve ser numérico com até 2 casas decimais.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(',', '.').trim() : value
  )
  valorMensalidade?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  faixaEtaria?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  estado?: string; // se quiser, podemos trocar para enum alinhado ao Prisma (BeneficiarioStatus)

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  contrato?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  comentario?: string;
}
