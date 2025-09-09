import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  Matches,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  BeneficiarioStatus,
  RegimeCobranca,
  MotivoMovimento,
  BeneficiarioTipo,
} from '@prisma/client';

/* ================= Helpers ================= */
const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : v);
const emptyToUndefined = (v: unknown) => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? undefined : t;
  }
  return v;
};
const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const toEnumInput = (v: unknown) =>
  typeof v === 'string' ? stripAccents(v).trim().toUpperCase() : v;

export enum SexoDto { M = 'M', F = 'F' }

/* ============ Validador titularId x tipo ============ */
@ValidatorConstraint({ name: 'TitularVinculoConsistency', async: false })
export class TitularVinculoConsistency implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const o = args.object as CreateBeneficiaryDto;
    const tipo = String(o?.tipo ?? '').toUpperCase();
    if (tipo === 'TITULAR') {
      return value === undefined || value === null || String(value).trim() === '';
    }
    return typeof value === 'string' && value.trim().length > 0;
  }
  defaultMessage(args: ValidationArguments): string {
    const o = args.object as CreateBeneficiaryDto;
    const tipo = String(o?.tipo ?? '').toUpperCase();
    return tipo === 'TITULAR'
      ? 'titularId não deve ser informado quando tipo = TITULAR.'
      : 'Para dependentes (FILHO/CONJUGE), o ID do titular é obrigatório.';
  }
}

/* ============ Datas consistentes (dataSaida >= dataEntrada) ============ */
@ValidatorConstraint({ name: 'DatesConsistency', async: false })
export class DatesConsistency implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const o = args.object as CreateBeneficiaryDto;
    if (!o?.dataEntrada || !o?.dataSaida) return true;
    const dIn = new Date(o.dataEntrada);
    const dOut = new Date(o.dataSaida);
    if (isNaN(dIn.getTime()) || isNaN(dOut.getTime())) return true;
    return dOut >= dIn;
  }
  defaultMessage(): string {
    return 'dataSaida não pode ser anterior à dataEntrada.';
  }
}

/* ============ Saída implica INATIVO ============ */
@ValidatorConstraint({ name: 'ExitImpliesInactive', async: false })
export class ExitImpliesInactive implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const o = args.object as CreateBeneficiaryDto;
    if (!o?.dataSaida) return true;
    return o.status !== BeneficiarioStatus.ATIVO;
  }
  defaultMessage(): string {
    return 'Quando dataSaida for informada, status deve ser INATIVO.';
  }
}

/* ===================== DTO ===================== */
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
   * Aceita "TITULAR", "FILHO", "CONJUGE" e o legado "DEPENDENTE" (mapeado para FILHO).
   */
  @Transform(({ value }) => {
    if (!value) return value;
    const v = toEnumInput(value);
    if (v === 'DEPENDENTE') return BeneficiarioTipo.FILHO;
    if (v === 'TITULAR') return BeneficiarioTipo.TITULAR;
    if (v === 'FILHO') return BeneficiarioTipo.FILHO;
    if (v === 'CONJUGE' || v === 'CONJUGUE' || v === 'CÔNJUGE') return BeneficiarioTipo.CONJUGE;
    return value;
  })
  @IsEnum(BeneficiarioTipo, { message: 'tipo deve ser TITULAR, FILHO ou CONJUGE.' })
  tipo!: BeneficiarioTipo;

  @IsDateString({}, { message: 'dataEntrada deve ser uma data ISO (YYYY-MM-DD).' })
  @IsNotEmpty()
  dataEntrada!: string;

  @Transform(({ value }) => emptyToUndefined(trim(value)))
  @Validate(TitularVinculoConsistency)
  @IsOptional()
  @IsString({ message: 'titularId deve ser uma string (cuid).' })
  titularId?: string;

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value))) matricula?: string;
  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value))) carteirinha?: string;

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

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value))) plano?: string;
  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value))) centroCusto?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined;
    const str = String(value).replace(',', '.').trim();
    return str === '' ? undefined : str;
  })
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'valorMensalidade deve ser numérico com até 2 casas decimais.',
  })
  valorMensalidade?: string;

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value))) faixaEtaria?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const v = emptyToUndefined(trim(value));
    if (typeof v !== 'string') return v;
    return v.toUpperCase();
  })
  @IsString()
  estado?: string;

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value))) contrato?: string;
  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value))) comentario?: string;

  @Transform(({ value, obj }) => {
    const v = value;
    const hasExit = !!obj?.dataSaida;
    if (v == null || v === '') {
      return hasExit ? BeneficiarioStatus.INATIVO : undefined;
    }
    const t = toEnumInput(v);
    if (t === 'ATIVO') return BeneficiarioStatus.ATIVO;
    if (t === 'INATIVO') return BeneficiarioStatus.INATIVO;
    return v;
  })
  @IsOptional()
  @IsEnum(BeneficiarioStatus, { message: 'status deve ser ATIVO ou INATIVO.' })
  status?: BeneficiarioStatus;

  @IsOptional()
  @IsDateString({}, { message: 'dataSaida deve ser data ISO (YYYY-MM-DD).' })
  @Validate(DatesConsistency)
  @Validate(ExitImpliesInactive)
  dataSaida?: string;

  @Transform(({ value }) => {
    if (!value) return undefined;
    const v = toEnumInput(value);
    if (v === 'MENSAL') return RegimeCobranca.MENSAL;
    if (v === 'DIARIO') return RegimeCobranca.DIARIO;
    return undefined;
  })
  @IsOptional()
  @IsEnum(RegimeCobranca, { message: 'regimeCobranca deve ser MENSAL ou DIARIO.' })
  regimeCobranca?: RegimeCobranca;

  @Transform(({ value }) => {
    if (!value) return undefined;
    const v = toEnumInput(value);
    if (v === 'INCLUSAO' || v === 'INCLUSAO ') return MotivoMovimento.INCLUSAO;
    if (v === 'EXCLUSAO') return MotivoMovimento.EXCLUSAO;
    if (v === 'ALTERACAO') return MotivoMovimento.ALTERACAO;
    if (v === 'NENHUM') return MotivoMovimento.NENHUM;
    return undefined;
  })
  @IsOptional()
  @IsEnum(MotivoMovimento, {
    message: 'motivoMovimento deve ser INCLUSAO, EXCLUSAO, ALTERACAO ou NENHUM.',
  })
  motivoMovimento?: MotivoMovimento;

  @IsOptional() @IsString() @Transform(({ value }) => emptyToUndefined(trim(value))) observacoes?: string;
}
