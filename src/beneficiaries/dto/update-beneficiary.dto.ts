import { PartialType } from '@nestjs/mapped-types';
import { CreateBeneficiaryDto, TitularVinculoConsistency } from './create-beneficiary.dto';
import { IsEnum, IsOptional, IsString, IsDateString, Validate } from 'class-validator';
import { Transform } from 'class-transformer';
import { BeneficiarioTipo } from '@prisma/client';

const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

export class UpdateBeneficiaryDto extends PartialType(CreateBeneficiaryDto) {
  /**
   * Também aceita o legado "DEPENDENTE" (mapeado para FILHO) no UPDATE.
   * Se "tipo" não vier no payload, nenhuma validação extra é aplicada.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === '') return value;
    const v = norm(value);
    if (v === 'DEPENDENTE') return BeneficiarioTipo.FILHO;
    if (v === 'TITULAR') return BeneficiarioTipo.TITULAR;
    if (v === 'FILHO') return BeneficiarioTipo.FILHO;
    if (v === 'CONJUGE' || v === 'CONJUGUE' || v === 'CÔNJUGE') return BeneficiarioTipo.CONJUGE;
    return value;
  })
  @IsEnum(BeneficiarioTipo, { message: 'tipo deve ser TITULAR, FILHO ou CONJUGE.' })
  override tipo?: BeneficiarioTipo;

  /** No update, dataEntrada é opcional, mas mantém a validação de formato */
  @IsOptional()
  @IsDateString({}, { message: 'dataEntrada deve ser uma data ISO (YYYY-MM-DD).' })
  override dataEntrada?: string;

  /**
   * Consistência do vínculo com titular:
   * - se tipo = TITULAR → titularId deve estar vazio
   * - se tipo = FILHO/CONJUGE → titularId é obrigatório
   * - se "tipo" não foi enviado no update → não bloqueia
   */
  @IsOptional()
  @IsString({ message: 'titularId deve ser uma string (cuid).' })
  @Validate(TitularVinculoConsistency)
  override titularId?: string;
}
