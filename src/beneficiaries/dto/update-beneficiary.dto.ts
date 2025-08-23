import { PartialType } from '@nestjs/mapped-types';
import { CreateBeneficiaryDto } from './create-beneficiary.dto';

/**
 * DTO de update parcial — mantém as mesmas validações,
 * mas torna todos os campos opcionais.
 * A regra do titularId x tipo continua valendo.
 */
export class UpdateBeneficiaryDto extends PartialType(CreateBeneficiaryDto) {}
