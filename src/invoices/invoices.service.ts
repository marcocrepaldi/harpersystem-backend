import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Papa from 'papaparse';
import * as xlsx from 'xlsx';
import {
  listImportedInvoicesDTO,
  reconcileInvoicesDTO,
} from './dto/invoices.dto';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  /* ----------------------------- helpers ---------------------------------- */

  private decodeSmart(buf: Buffer): { text: string; encoding: 'utf-8' | 'latin1' } {
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

  private toNumberSmart(raw: any): number {
    if (raw == null) return NaN;
    if (typeof raw === 'number') return raw;

    let s = String(raw).trim();
    if (!s) return NaN;

    s = s.replace(/r\$\s*/i, '').replace(/\s+/g, '');

    const negative = /^\(.*\)$/.test(s);
    if (negative) s = s.slice(1, -1);

    if (/^\d+$/.test(s)) {
      const n = Number(s);
      const val = s.length >= 3 ? n / 100 : n;
      return negative ? -val : val;
    }

    if (s.includes(',') && s.includes('.')) {
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
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

  /* ------------------------------- main ------------------------------------ */

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

    const pick = (obj: Record<string, any>, aliases: string[]) => {
      for (const a of aliases) {
        if (obj[a] !== undefined && obj[a] !== null && String(obj[a]).trim() !== '') {
          return obj[a];
        }
      }
      return undefined;
    };

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

        console.log(
          '[Invoices] CSV',
          { encoding, headerIndex, delimiter, count: rows.length },
        );
        console.log('[Invoices] headers(raw):', Object.keys(rows[0] || {}));
      } else if (isExcel) {
        const wb = xlsx.read(file.buffer, { type: 'buffer' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = xlsx.utils.sheet_to_json(sheet ?? {}, { defval: '' });
        console.log(
          '[Invoices] XLS/XLSX',
          { sheet: wb.SheetNames[0], count: rows.length },
        );
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

    const normalized = rows.map((r) => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(r)) out[this.normalizeKey(k)] = v;
      return out;
    });

    const normFirst = normalized[0] || {};
    console.log('[Invoices] headers(normalized):', Object.keys(normFirst));

    const now = new Date();
    const mesReferencia = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );

    let processedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.faturaImportada.deleteMany({ where: { clientId, mesReferencia } });

      for (const rec of normalized) {
        const nome = pick(rec, NAME_ALIASES);
        const cpfRaw = pick(rec, CPF_ALIASES);
        const valorRaw = pick(rec, VALOR_ALIASES);

        if (!cpfRaw) continue;

        const cpf = String(cpfRaw).replace(/\D/g, '');
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
            valorCobradoOperadora:
              valor === null || Number.isNaN(valor) ? null : valor,
            statusConciliacao: 'pendente',
            raw: rec,
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
      detectedColumns: {
        nome: detect(NAME_ALIASES),
        cpf: detect(CPF_ALIASES),
        valor: detect(VALOR_ALIASES),
      },
      mesReferencia: `${mesReferencia.getUTCFullYear()}-${String(
        mesReferencia.getUTCMonth() + 1,
      ).padStart(2, '0')}`,
    };
  }

  async listImported(
    clientId: string,
    { mes, page = 1, limit = 100, search }: listImportedInvoicesDTO,
  ) {
    const today = new Date();
    let mesToFilter = mes;

    if (!mesToFilter) {
      mesToFilter = `${today.getUTCFullYear()}-${String(
        today.getUTCMonth() + 1,
      ).padStart(2, '0')}`;
    }

    const [year, month] = mesToFilter.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const totalCount = await this.prisma.faturaImportada.count({
      where: {
        clientId,
        mesReferencia: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    const faturas = await this.prisma.faturaImportada.findMany({
      where: {
        clientId,
        mesReferencia: {
          gte: startDate,
          lt: endDate,
        },
      },
      take: limit,
      skip: (page - 1) * limit,
    });

    return {
      totalCount,
      page,
      limit,
      data: faturas,
      hasMore: faturas.length === limit,
    };
  }

  async deleteInvoiceByMonth(clientId: string, mesReferencia: Date) {
    const { count } = await this.prisma.faturaImportada.deleteMany({
      where: { clientId, mesReferencia },
    });
    return {
      message: `Foram deletadas ${count} faturas do mês de referência.`,
      deletedCount: count,
    };
  }
  
  // ✅ NOVO: Método de conciliação que estava faltando
  async reconcileByIds(clientId: string, invoiceIds: string[]) {
    // Aqui você pode adicionar a lógica de conciliação.
    // Por exemplo, você pode buscar as faturas por ID e atualizar o status.
    const reconciled = await this.prisma.faturaImportada.updateMany({
      where: {
        id: { in: invoiceIds },
        clientId,
      },
      data: {
        statusConciliacao: 'conciliada',
      },
    });

    return {
      message: `${reconciled.count} faturas foram conciliadas com sucesso.`,
      reconciledCount: reconciled.count,
    };
  }
}