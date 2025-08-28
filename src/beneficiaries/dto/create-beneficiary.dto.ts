import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  Matches,
  ValidateIf,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  BeneficiarioStatus,
  RegimeCobranca,
  MotivoMovimento,
  BeneficiarioTipo,
} from '@prisma/client';

// ===== Helpers =====
const trim = (v: any) => (typeof v === 'string' ? v.trim() : v);
const emptyToUndefined = (v: any) => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? undefined : t;
  }
  return v;
};

// Mapeia strings variadas -> enum SexoDto simples
export enum SexoDto { M = 'M', F = 'F' }

// ===== Validador vínculo com titular =====
@ValidatorConstraint({ name: 'TitularVinculoConsistency', async: false })
export class TitularVinculoConsistency implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const o = args.object as CreateBeneficiaryDto;
    if (o.tipo === BeneficiarioTipo.TITULAR || String(o.tipo).toUpperCase() === 'TITULAR') {
      // não deve existir
      return value === undefined || value === null || value === '';
    }
    // dependente (FILHO/CONJUGE/“DEPENDENTE”) => obrigatório
    return typeof value === 'string' && value.length > 0;
  }
  defaultMessage(args: ValidationArguments): string {
    const o = args.object as CreateBeneficiaryDto;
    if (o.tipo === BeneficiarioTipo.TITULAR || String(o.tipo).toUpperCase() === 'TITULAR') {
      return 'titularId não deve ser informado quando tipo = TITULAR.';
    }
    return 'titularId é obrigatório para dependentes (FILHO/CONJUGE).';
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

  /**
   * Aceita "TITULAR", "FILHO", "CONJUGE" e o legado "DEPENDENTE" (mapeado internamente para FILHO).
   */
  @Transform(({ value }) => {
    if (!value) return value;
    const v = String(value).trim().toUpperCase();
    if (v === 'DEPENDENTE') return BeneficiarioTipo.FILHO;
    if (v === 'TITULAR') return BeneficiarioTipo.TITULAR;
    if (v === 'FILHO') return BeneficiarioTipo.FILHO;
    if (v === 'CONJUGE' || v === 'CÔNJUGE') return BeneficiarioTipo.CONJUGE;
    return value;
  })
  @IsEnum(BeneficiarioTipo, { message: 'tipo deve ser TITULAR, FILHO ou CONJUGE.' })
  tipo!: BeneficiarioTipo;

  @IsDateString({}, { message: 'dataEntrada deve ser uma data ISO (YYYY-MM-DD).' })
  @IsNotEmpty()
  dataEntrada!: string;

  @Validate(TitularVinculoConsistency)
  @ValidateIf((o: CreateBeneficiaryDto) => o.tipo !== BeneficiarioTipo.TITULAR)
  @IsString({ message: 'titularId deve ser uma string (cuid).' })
  titularId?: string;

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value)))
  matricula?: string;

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value)))
  carteirinha?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    const v = String(value).trim().toUpperCase();
    if (v.startsWith('M')) return SexoDto.M;
    if (v.startsWith('F')) return SexoDto.F;
    return undefined;
  })
  @IsEnum(SexoDto, { message: 'sexo deve ser "M" ou "F".' })
  sexo?: SexoDto;

  @IsOptional()
  @IsDateString({}, { message: 'dataNascimento deve ser uma data ISO (YYYY-MM-DD).' })
  dataNascimento?: string;

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value)))
  plano?: string;

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value)))
  centroCusto?: string;

  /**
   * Aceita "1234.56" ou "1234,56". Normaliza para ponto.
   * Prisma Decimal aceita string.
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

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value)))
  faixaEtaria?: string;

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value)))
  estado?: string;

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value)))
  contrato?: string;

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value)))
  comentario?: string;

  // ===== Novos campos suportados pelo schema =====

  @IsOptional()
  @IsEnum(BeneficiarioStatus, { message: 'status deve ser ATIVO ou INATIVO.' })
  status?: BeneficiarioStatus;

  @IsOptional()
  @IsDateString({}, { message: 'dataSaida deve ser data ISO (YYYY-MM-DD).' })
  dataSaida?: string;

  @IsOptional()
  @IsEnum(RegimeCobranca, { message: 'regimeCobranca deve ser MENSAL ou DIARIO.' })
  regimeCobranca?: RegimeCobranca;

  @IsOptional()
  @IsEnum(MotivoMovimento, {
    message: 'motivoMovimento deve ser INCLUSAO, EXCLUSAO, ALTERACAO ou NENHUM.',
  })
  motivoMovimento?: MotivoMovimento;

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value)))
  observacoes?: string;
}
