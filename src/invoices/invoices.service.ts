import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Papa from 'papaparse';
import * as xlsx from 'xlsx';
import {
  listImportedInvoicesDTO,
} from './dto/invoices.dto';

/**
 * Serviço de importação/consulta de faturas.
 * - Lê CSV/XLS/XLSX
 * - Normaliza cabeçalhos (sem acento/espacos)
 * - Converte valores monetários de forma resiliente
 * - (NOVO) Filtra por coluna "credencial" mantendo apenas linhas cujo prefixo (5 chars) é "0TATM"
 *   -> permite separar Saúde (0TATM) de Dental (ex.: 0TAYS)
 * - Grava em "health_imported_invoices" (tabela FaturaImportada), modelo de 1 linha por beneficiário
 */
@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  /* ----------------------------- helpers ---------------------------------- */

  private decodeSmart(buf: Buffer): { text: string; encoding: 'utf-8' | 'latin1' } {
    // tenta UTF-8; se houver muitos caracteres de substituição (�), volta para latin1
    const utf8 = buf.toString('utf-8');
    const repl = (utf8.match(/\uFFFD/g) || []).length;
    if (repl <= 2) return { text: utf8, encoding: 'utf-8' };
    return { text: buf.toString('latin1'), encoding: 'latin1' };
  }

  private stripBom(s: string) {
    return s.replace(/^\uFEFF/, '');
  }

  private normalizeKey(k: string) {
    return (k || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s._-]+/g, '');
  }

  /**
   * Converte valores monetários em BR para número.
   * Aceita:
   *  - "R$ 29.781,00" -> 29781
   *  - "29781"        -> 297.81 (interpreta como centavos)
   *  - "29,781.00"    -> 29781
   *  - "(123,45)"     -> -123.45
   */
  private toNumberSmart(raw: any): number {
    if (raw == null) return NaN;
    if (typeof raw === 'number') return raw;

    let s = String(raw).trim();
    if (!s) return NaN;

    s = s.replace(/r\$\s*/i, '').replace(/\s+/g, '');

    const negative = /^\(.*\)$/.test(s);
    if (negative) s = s.slice(1, -1);

    // só dígitos -> assume centavos quando >= 3 dígitos
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      const val = s.length >= 3 ? n / 100 : n;
      return negative ? -val : val;
    }

    // heurística de separadores
    if (s.includes(',') && s.includes('.')) {
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(',', '.'); // BR
      } else {
        s = s.replace(/,/g, ''); // US
      }
    } else {
      if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    }

    const out = Number(s);
    return negative ? -out : out;
  }

  private findHeaderIndex(lines: string[]): number {
    const norm = (t: string) =>
      t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tokens = [
      'cpf',
      'beneficiario',
      'beneficiário',
      'nome',
      'mensalidade',
      'valor',
      'valor cobrado',
      'matricula',
      'credencial',
      'unidade',
      'empresa',
      'cobrado',
    ];
    let bestIdx = 0;
    let bestScore = -1;
    const maxScan = Math.min(lines.length, 80);
    for (let i = 0; i < maxScan; i++) {
      const l = norm(lines[i]);
      const score = tokens.reduce((acc, t) => acc + (l.includes(t) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
      if (score >= 3) break;
    }
    return bestIdx;
  }

  private detectDelimiter(sampleLine: string): ',' | ';' | '\t' {
    const counts: Array<[string, number]> = [
      [',', (sampleLine.match(/,/g) || []).length],
      [';', (sampleLine.match(/;/g) || []).length],
      ['\t', (sampleLine.match(/\t/g) || []).length],
    ];
    counts.sort((a, b) => b[1] - a[1]);
    return (counts[0]?.[0] as ',' | ';' | '\t') ?? ';';
  }

  private cleanCPF(v: string | null | undefined) {
    return (v || '').replace(/\D/g, '').slice(0, 11);
  }

  private toBRL(n: number) {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /* ------------------------------- main ------------------------------------ */

  /**
   * Importa arquivo e grava em FaturaImportada (1 linha/beneficiário).
   * (NOVO) Filtra por credencial começando com 0TATM (5 primeiros caracteres).
   */
  async processInvoiceUpload(clientId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');

    const name = (file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    const isCsv =
      name.endsWith('.csv') ||
      mime.includes('text/csv') ||
      mime.includes('application/csv') ||
      (mime === 'application/vnd.ms-excel' && name.endsWith('.csv'));

    const isExcel =
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      mime.includes('spreadsheetml') ||
      (mime === 'application/vnd.ms-excel' &&
        (name.endsWith('.xls') || name.endsWith('.xlsx')));

    // aliases normalizados
    const NAME_ALIASES = [
      'beneficiario',
      'beneficiário',
      'nome',
      'nomebeneficiario',
      'nome_beneficiario',
      'nomebeneficiariooperadora',
      'nmbeneficiario',
    ].map((k) => this.normalizeKey(k));

    const CPF_ALIASES = [
      'cpf',
      'cpfbeneficiario',
      'cpf_documento',
      'cpfdocumento',
      'documento',
      'cpfbeneficiariooperadora',
      'cpfcnpj',
    ].map((k) => this.normalizeKey(k));

    const VALOR_ALIASES = [
      'valor',
      'valorcobrado',
      'valor_cobrado',
      'mensalidade',
      'valor_mensalidade',
      'valor_mensal',
      'vlmensalidade',
      'premio',
      'premio_mensal',
      'fa',
      'fatura',
      'valorcontrato',
      'valor_contrato',
      'vlcobrado',
      'vl_cobrado',
      'vlpago',
      'vl_pago',
      'valorplano',
      'valor_plano',
      'cobrado',
    ].map((k) => this.normalizeKey(k));

    const CREDENCIAL_ALIASES = [
      'credencial',
      'cdcredencial',
      'cred',
      'carteirinha', // alguns layouts usam o mesmo campo; mantemos por segurança
    ].map((k) => this.normalizeKey(k));

    const pick = (obj: Record<string, any>, aliases: string[]) => {
      for (const a of aliases) {
        if (obj[a] !== undefined && obj[a] !== null && String(obj[a]).trim() !== '') {
          return obj[a];
        }
      }
      return undefined;
    };

    // leitura
    let rows: any[] = [];

    try {
      if (isCsv && !isExcel) {
        const { text: fullRaw, encoding } = this.decodeSmart(file.buffer);
        const contentFull = this.stripBom(fullRaw);

        const allLines = contentFull.split(/\r?\n/);
        const headerIndex = this.findHeaderIndex(allLines);
        const content = allLines.slice(headerIndex).join('\n');

        const firstLine =
          content.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
        const delimiter = this.detectDelimiter(firstLine);

        const parsed = Papa.parse(content, {
          header: true,
          skipEmptyLines: true,
          delimiter,
          dynamicTyping: false,
        });

        rows = (parsed.data as any[]).filter((r) => r && Object.keys(r).length);

        console.log('[Invoices] CSV', { encoding, headerIndex, delimiter, count: rows.length });
        console.log('[Invoices] headers(raw):', Object.keys(rows[0] || {}));
      } else if (isExcel) {
        const wb = xlsx.read(file.buffer, { type: 'buffer' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = xlsx.utils.sheet_to_json(sheet ?? {}, { defval: '' });
        console.log('[Invoices] XLS/XLSX', { sheet: wb.SheetNames[0], count: rows.length });
        console.log('[Invoices] headers(raw):', Object.keys(rows[0] || {}));
      } else {
        throw new BadRequestException(
          `Tipo de arquivo não suportado: ${file.mimetype} (${file.originalname})`,
        );
      }
    } catch (err) {
      console.error('Erro ao ler arquivo:', err);
      throw new BadRequestException(
        'Falha ao ler o arquivo. Verifique o formato e o layout.',
      );
    }

    // normaliza chaves
    const normalized = rows.map((r) => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(r)) out[this.normalizeKey(k)] = v;
      return out;
    });

    const normFirst = normalized[0] || {};
    console.log('[Invoices] headers(normalized):', Object.keys(normFirst));

    // (NOVO) filtro por credencial prefixada
    const REQUIRED_PREFIX = (process.env.INVOICE_CREDENTIAL_PREFIX || '0TATM').toUpperCase();
    const kept = normalized.filter((rec) => {
      const cred = pick(rec, CREDENCIAL_ALIASES);
      if (!cred) return true; // se não houver coluna, não filtramos
      const prefix = String(cred).toUpperCase().slice(0, 5);
      return prefix === REQUIRED_PREFIX;
    });

    const dropped = normalized.length - kept.length;
    if (dropped > 0) {
      console.log(`[Invoices] Filtradas por credencial=${REQUIRED_PREFIX}: mantidas=${kept.length}, descartadas=${dropped}`);
    }

    // mês de referência = 1º dia UTC do mês atual (ajuste se precisar ler do arquivo)
    const now = new Date();
    const mesReferencia = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

    // gravação
    let processedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      // sobrescreve importações do mesmo mês/cliente
      await tx.faturaImportada.deleteMany({ where: { clientId, mesReferencia } });

      for (const rec of kept) {
        const nome = pick(rec, NAME_ALIASES);
        const cpfRaw = pick(rec, CPF_ALIASES);
        const valorRaw = pick(rec, VALOR_ALIASES);

        if (!cpfRaw) continue;

        const cpf = this.cleanCPF(String(cpfRaw));
        if (cpf.length !== 11) continue;

        const valor =
          valorRaw == null || String(valorRaw).trim() === ''
            ? null
            : this.toNumberSmart(valorRaw);

        await tx.faturaImportada.create({
          data: {
            cliente: { connect: { id: clientId } },
            mesReferencia,
            nomeBeneficiarioOperadora: (nome ?? '').toString() || null,
            cpfBeneficiarioOperadora: cpf,
            valorCobradoOperadora: valor === null || Number.isNaN(valor) ? null : valor,
            statusConciliacao: 'pendente',
            raw: rec, // mantemos linha crua para auditoria
          },
        });

        processedCount++;
      }
    });

    const detect = (aliases: string[]) =>
      aliases.find((a) => normFirst[a] !== undefined) ?? null;

    return {
      message: 'Fatura importada com sucesso.',
      processedRows: processedCount,
      totalRows: rows.length,
      filteredOutByCredential: dropped,
      credentialPrefix: REQUIRED_PREFIX,
      detectedColumns: {
        nome: detect(NAME_ALIASES),
        cpf: detect(CPF_ALIASES),
        valor: detect(VALOR_ALIASES),
        credencial: detect(CREDENCIAL_ALIASES),
      },
      mesReferencia: `${mesReferencia.getUTCFullYear()}-${String(
        mesReferencia.getUTCMonth() + 1,
      ).padStart(2, '0')}`,
    };
  }

  /**
   * Lista faturas importadas do mês, com paginação e (opcional) busca simples.
   */
  async listImported(
    clientId: string,
    { mes, page = 1, limit = 100, search }: listImportedInvoicesDTO,
  ) {
    const today = new Date();
    const ym = mes || `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;

    const [year, month] = ym.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const whereBase = {
      clientId,
      mesReferencia: { gte: startDate, lt: endDate },
      ...(search
        ? {
            OR: [
              { nomeBeneficiarioOperadora: { contains: search, mode: 'insensitive' as const } },
              { cpfBeneficiarioOperadora: { contains: search.replace(/\D/g, '') } },
            ],
          }
        : {}),
    };

    const [totalCount, faturas] = await Promise.all([
      this.prisma.faturaImportada.count({ where: whereBase }),
      this.prisma.faturaImportada.findMany({
        where: whereBase,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: [{ createdAt: 'asc' }],
      }),
    ]);

    return {
      totalCount,
      page,
      limit,
      data: faturas,
      hasMore: (page * limit) < totalCount,
      mes: ym,
    };
  }

  /**
   * Remove todas as importações do mês/cliente.
   */
  async deleteInvoiceByMonth(clientId: string, mesReferencia: Date) {
    const { count } = await this.prisma.faturaImportada.deleteMany({
      where: { clientId, mesReferencia },
    });
    return {
      message: `Foram deletadas ${count} faturas do mês de referência.`,
      deletedCount: count,
    };
  }

  /**
   * Marca um conjunto de linhas como conciliadas (usado pelo botão "Marcar como Conciliado").
   */
  async reconcileByIds(clientId: string, invoiceIds: string[]) {
    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      throw new BadRequestException('Informe pelo menos 1 ID de fatura para conciliar.');
    }

    const result = await this.prisma.faturaImportada.updateMany({
      where: { id: { in: invoiceIds }, clientId },
      data: { statusConciliacao: 'conciliada' },
    });

    return {
      message: `${result.count} faturas foram conciliadas com sucesso.`,
      reconciledCount: result.count,
    };
  }
}
