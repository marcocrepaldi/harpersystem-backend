import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsOptional } from 'class-validator';
import { CreateClientDto } from './create-client.dto';

/** Mantém o Partial de Create + campo para controle de concorrência */
export class UpdateClientDto extends PartialType(CreateClientDto) {
  /** Se informado, garante que só atualiza se o registro não mudou desde então */
  @IsOptional() @IsDateString()
  expectedUpdatedAt?: string;
}
