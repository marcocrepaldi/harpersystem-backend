import { PartialType } from '@nestjs/mapped-types';
import { CreateBeneficiaryDto } from './create-beneficiary.dto';

/**
 * Update parcial — herda todas as validações do Create
 * e torna os campos opcionais (inclui status, regime, motivo, etc.).
 */
export class UpdateBeneficiaryDto extends PartialType(CreateBeneficiaryDto) {}
