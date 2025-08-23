import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ParseCuidPipe implements PipeTransform<string, string> {
  private readonly cuidRegex = /^c[^\s-]{24,}$/i;
  transform(value: string): string {
    if (!value || !this.cuidRegex.test(value)) {
      throw new BadRequestException('Parâmetro inválido: clientId deve ser um CUID.');
    }
    return value;
  }
}
