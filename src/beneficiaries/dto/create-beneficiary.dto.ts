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

// ===== Enums usados no DTO =====
export enum BeneficiarioTipoDto { TITULAR = 'TITULAR', FILHO = 'FILHO', CONJUGE = 'CONJUGE' }
export enum SexoDto { M = 'M', F = 'F' }

// ===== Helpers =====
const trim = (v: any) => (typeof v === 'string' ? v.trim() : v);
const emptyToUndefined = (v: any) => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? undefined : t;
  }
  return v;
};

// ===== Validador de consistência do vínculo com titular =====
/**
 * Regra:
 *  - tipo = TITULAR  => titularId NÃO deve ser informado (deve ser vazio/omisso)
 *  - tipo = FILHO/CONJUGE => titularId OBRIGATÓRIO
 */
@ValidatorConstraint({ name: 'TitularVinculoConsistency', async: false })
export class TitularVinculoConsistency implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const o = args.object as CreateBeneficiaryDto;
    if (o.tipo === BeneficiarioTipoDto.TITULAR) {
      // não deve existir
      return value === undefined || value === null || value === '';
    }
    // FILHO/CONJUGE => obrigatório
    return typeof value === 'string' && value.length > 0;
  }
  defaultMessage(args: ValidationArguments): string {
    const o = args.object as CreateBeneficiaryDto;
    if (o.tipo === BeneficiarioTipoDto.TITULAR) {
      return 'titularId não deve ser informado quando tipo = TITULAR.';
    }
    return 'titularId é obrigatório quando tipo = FILHO ou CONJUGE.';
  }
}

// ===== DTO =====
export class CreateBeneficiaryDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome completo é obrigatório.' })
  @Transform(({ value }) => emptyToUndefined(trim(value)))
  nomeCompleto!: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const digits = value.replace(/\D/g, '').trim();
    return digits === '' ? undefined : digits;
  })
  @Matches(/^\d{11}$/, { message: 'CPF deve conter exatamente 11 dígitos numéricos.' })
  cpf?: string;

  @IsEnum(BeneficiarioTipoDto, { message: 'tipo deve ser TITULAR, FILHO ou CONJUGE.' })
  tipo!: BeneficiarioTipoDto;

  @IsDateString({}, { message: 'dataEntrada deve ser uma data ISO (YYYY-MM-DD).' })
  @IsNotEmpty()
  dataEntrada!: string;

  // Consistência do vínculo: usa o validador customizado e,
  // quando obrigatório (não-TITULAR), aplica validação de UUID.
  @Validate(TitularVinculoConsistency)
  @ValidateIf((o: CreateBeneficiaryDto) => o.tipo !== BeneficiarioTipoDto.TITULAR)
  @IsUUID('4', { message: 'titularId deve ser um UUID v4 válido.' })
  titularId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => emptyToUndefined(trim(value)))
  matricula?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => emptyToUndefined(trim(value)))
  carteirinha?: string;

  @IsOptional()
  @IsEnum(SexoDto, { message: 'sexo deve ser "M" ou "F".' })
  sexo?: SexoDto;

  @IsOptional()
  @IsDateString({}, { message: 'dataNascimento deve ser uma data ISO (YYYY-MM-DD).' })
  dataNascimento?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => emptyToUndefined(trim(value)))
  plano?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => emptyToUndefined(trim(value)))
  centroCusto?: string;

  /**
   * Aceita "1234.56" ou "1234,56". Normaliza para ponto.
   * Se no Prisma usa Decimal (string), manter como string é ok.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const t = value.replace(',', '.').trim();
    return t === '' ? undefined : t;
  })
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'valorMensalidade deve ser numérico com até 2 casas decimais.',
  })
  valorMensalidade?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => emptyToUndefined(trim(value)))
  faixaEtaria?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => emptyToUndefined(trim(value)))
  estado?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => emptyToUndefined(trim(value)))
  contrato?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => emptyToUndefined(trim(value)))
  comentario?: string;
}
