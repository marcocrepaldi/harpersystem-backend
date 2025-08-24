import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Papa from 'papaparse';
import * as xlsx from 'xlsx';

/**
 * Importação de faturas (CSV/XLS/XLSX) robusta para layouts de operadora.
 * - Detecta encoding (utf-8 vs latin1)
 * - Ignora preâmbulos acima do cabeçalho real
 * - Autodetecta delimitador ; ou ,
 * - Aliases amplos (cpf/nome/valor)
 * - Valor opcional; normaliza centavos
 */
@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  private decodeSmart(buf: Buffer): { text: string; encoding: 'utf-8' | 'latin1' } {
    // 1) tenta utf-8
    const utf8 = buf.toString('utf-8');
    const replacements = (utf8.match(/\uFFFD/g) || []).length; // �
    if (replacements <= 2) return { text: utf8, encoding: 'utf-8' };

    // 2) fallback para latin1 (comum em CSVs de operadora)
    const latin1 = buf.toString('latin1');
    return { text: latin1, encoding: 'latin1' };
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

    const s = String(raw).trim();

    // se vier só dígitos, supor centavos (padrão comum em "mensalidade")
    if (/^\d+$/.test(s)) {
      if (s.length >= 3) return Number(s) / 100;
      return Number(s);
    }

    // "1.234,56" | "1234,56" | "1,234.56" -> 1234.56
    const normalized = s.replace(/\./g, '').replace(',', '.');
    return Number(normalized);
  }

  private findHeaderIndex(lines: string[]): number {
    // tenta achar a linha com maior “cara” de cabeçalho
    const norm = (t: string) =>
      t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // termos fortes que costumam aparecer no header
    const tokens = [
      'cpf',
      'beneficiario',
      'matricula',
      'mensalidade',
      'valor',
      'valor cobrado',
      'empresa',
      'unidade',
      'credencial',
      'nome_unidade',
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
      if (score >= 3) break; // “bom o suficiente”
    }
    return bestIdx;
  }

  async processInvoiceUpload(clientId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');

    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();

    // Aliases (inclui layout Hapvida)
    const NAME_ALIASES = [
      'beneficiario',
      'beneficiário',
      'nome',
      'nomebeneficiario',
      'nome_beneficiario',
      'nomebeneficiariooperadora',
    ].map(this.normalizeKey);

    const CPF_ALIASES = [
      'cpf',
      'cpfbeneficiario',
      'cpf_documento',
      'cpfdocumento',
      'documento',
      'cpfbeneficiariooperadora',
    ].map(this.normalizeKey);

    const VALOR_ALIASES = [
      'valor',
      'valorcobrado',
      'valor_cobrado',
      'mensalidade', // <- Hapvida
      'valor_mensalidade',
      'valor_mensal',
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
    ].map(this.normalizeKey);

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
      const isXls = name.endsWith('.xls');
      const isCsv =
        !isXls && (mime.startsWith('text/csv') || mime.includes('application/csv') || name.endsWith('.csv'));
      const isXlsx = isXls || mime.includes('spreadsheetml.sheet') || name.endsWith('.xlsx');

      if (isCsv) {
        // ---- CSV robusto (encoding + header + delimiter) ----
        const { text: contentFull, encoding } = this.decodeSmart(file.buffer);

        const allLines = contentFull.split(/\r?\n/);
        const headerIndex = this.findHeaderIndex(allLines);
        const content = allLines.slice(headerIndex).join('\n');

        // autodetecta delimitador na primeira linha útil
        const firstLine = content.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
        const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';

        const parsed = Papa.parse(content, {
          header: true,
          skipEmptyLines: true,
          delimiter,
          dynamicTyping: false,
        });

        if (parsed.errors?.length) {
          // não derruba; apenas loga alguns erros para diagnóstico
          // eslint-disable-next-line no-console
          console.warn('Papaparse errors:', parsed.errors.slice(0, 3));
        }

        rows = (parsed.data as any[]).filter(Boolean);

        // eslint-disable-next-line no-console
        console.log('[Invoices] CSV debug -> encoding:', encoding, 'headerIndex:', headerIndex, 'delimiter:', delimiter);
        // eslint-disable-next-line no-console
        console.log('[Invoices] headers (raw):', Object.keys(rows[0] || {}));
      } else if (isXlsx) {
        const wb = xlsx.read(file.buffer, { type: 'buffer' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = xlsx.utils.sheet_to_json(sheet ?? {});
        // eslint-disable-next-line no-console
        console.log('[Invoices] XLSX headers (raw):', Object.keys(rows[0] || {}));
      } else {
        throw new BadRequestException(`Tipo de arquivo não suportado: ${file.mimetype} (${file.originalname})`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Erro ao ler arquivo:', err);
      throw new BadRequestException('Falha ao ler o arquivo. Verifique o formato e o layout.');
    }

    // Normaliza chaves para lookup
    const normalized = rows.map((r) => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(r)) {
        out[this.normalizeKey(k)] = v;
      }
      return out;
    });

    const normFirst = normalized[0] || {};
    // eslint-disable-next-line no-console
    console.log('[Invoices] headers (normalized):', Object.keys(normFirst));

    // mês referência = 1º dia do mês (UTC)
    const now = new Date();
    const mesReferencia = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

    let processedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.faturaImportada.deleteMany({ where: { clientId, mesReferencia } });

      for (const rec of normalized) {
        const nome = pick(rec, NAME_ALIASES);
        const cpfRaw = pick(rec, CPF_ALIASES);
        const valorRaw = pick(rec, VALOR_ALIASES);

        if (!cpfRaw) continue; // CPF é essencial para conciliação

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
            valorCobradoOperadora: valor === null || Number.isNaN(valor) ? null : valor,
            statusConciliacao: 'pendente',
            raw: rec,
          },
        });
        processedCount++;
      }
    });

    // quais colunas batemos?
    const detect = (aliases: string[]) => aliases.find((a) => normFirst[a] !== undefined) ?? null;

    return {
      message: 'Fatura importada com sucesso.',
      processedRows: processedCount,
      totalRows: rows.length,
      detectedColumns: {
        nome: detect(NAME_ALIASES),
        cpf: detect(CPF_ALIASES),
        valor: detect(VALOR_ALIASES),
      },
    };
  }

  async deleteInvoiceByMonth(clientId: string, mesReferencia: Date) {
    const [stats] = await this.prisma.$transaction(async (tx) => {
      const agg = await tx.faturaImportada.aggregate({
        where: { clientId, mesReferencia },
        _count: { _all: true },
        _sum: { valorCobradoOperadora: true },
      });
      const del = await tx.faturaImportada.deleteMany({ where: { clientId, mesReferencia } });
      return [{ deletedCount: del.count, deletedSum: agg._sum.valorCobradoOperadora ?? 0 }];
    });

    return {
      ok: true,
      message: 'Fatura do mês removida.',
      mesReferencia: `${mesReferencia.getUTCFullYear()}-${String(
        mesReferencia.getUTCMonth() + 1,
      ).padStart(2, '0')}-01`,
      ...stats,
    };
  }
}
