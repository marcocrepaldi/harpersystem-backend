import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Papa from 'papaparse';
import * as xlsx from 'xlsx';
import { listImportedInvoicesDTO, reconcileInvoicesDTO } from './dto/invoices.dto';

/**
 * Serviço de importação/consulta de faturas.
 * - Lê CSV/XLS/XLSX
 * - Normaliza cabeçalhos (sem acento/espacos)
 * - Converte valores monetários de forma resiliente
 * - Filtra por coluna "credencial" mantendo apenas linhas cujo prefixo é "0TATM"
 * - Grava em "health_imported_invoices" (tabela FaturaImportada), 1 linha/beneficiário
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

  /* ------------------------------- main ------------------------------------ */

  /**
   * Importa arquivo e grava em FaturaImportada (1 linha/beneficiário).
   * Filtra por credencial começando com 0TATM, economizando memória.
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

    const REQUIRED_PREFIX = (process.env.INVOICE_CREDENTIAL_PREFIX || '0TATM').toUpperCase();

    // queremos só essas chaves para reduzir custo de normalização
    const NEEDED_KEYS = new Set([
      ...NAME_ALIASES,
      ...CPF_ALIASES,
      ...VALOR_ALIASES,
      ...CREDENCIAL_ALIASES,
    ]);

    const normalizeNeeded = (obj: Record<string, any>) => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        const nk = this.normalizeKey(k);
        if (NEEDED_KEYS.has(nk)) out[nk] = v;
      }
      return out;
    };

    const matchesCredential = (rec: Record<string, any>) => {
      const cred = pick(rec, CREDENCIAL_ALIASES);
      if (!cred) return false;
      const prefix = String(cred).trim().toUpperCase();
      return prefix.startsWith(REQUIRED_PREFIX);
    };

    // leitura + filtro imediato
    let kept: Record<string, any>[] = [];
    let totalRows = 0;

    try {
      if (isCsv && !isExcel) {
        const { text: fullRaw } = this.decodeSmart(file.buffer);
        const contentFull = this.stripBom(fullRaw);

        const allLines = contentFull.split(/\r?\n/);
        const headerIndex = this.findHeaderIndex(allLines);
        const content = allLines.slice(headerIndex).join('\n');

        const firstLine = content.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
        const delimiter = this.detectDelimiter(firstLine);

        // filtra durante o parsing (não materializa tudo)
        Papa.parse(content, {
          header: true,
          skipEmptyLines: true,
          delimiter,
          dynamicTyping: false,
          step: (row: Papa.ParseStepResult<any>) => {
            const rec = normalizeNeeded(row.data as Record<string, any>);
            if (!Object.keys(rec).length) return;
            totalRows++;
            if (matchesCredential(rec)) kept.push(rec);
          },
        });
      } else if (isExcel) {
        const wb = xlsx.read(file.buffer, { type: 'buffer' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) throw new BadRequestException('Planilha vazia.');

        const ref = String(sheet['!ref'] || '');
        if (!ref) throw new BadRequestException('Intervalo da planilha não encontrado.');
        const range = xlsx.utils.decode_range(ref);

        // detecta a linha de header (heurística semelhante ao CSV)
        const norm = (t: any) =>
          String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const tokens = [
          'cpf',
          'beneficiario',
          'beneficiário',
          'nome',
          'mensalidade',
          'valor',
          'credencial',
          'carteirinha',
          'cobrado',
        ];
        let headerRow = range.s.r;
        let bestScore = -1;

        for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 80); r++) {
          let rowStr = '';
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = sheet[xlsx.utils.encode_cell({ r, c })];
            if (cell?.v != null) rowStr += ' ' + cell.v;
          }
          const s = norm(rowStr);
          const score = tokens.reduce((acc, t) => acc + (s.includes(t) ? 1 : 0), 0);
          if (score > bestScore) {
            bestScore = score;
            headerRow = r;
          }
          if (score >= 3) break;
        }

        // headers normalizados por coluna (de s.c..e.c)
        const headers: string[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = sheet[xlsx.utils.encode_cell({ r: headerRow, c })];
          headers.push(this.normalizeKey(String(cell?.v ?? '')));
        }

        // mapeia apenas colunas de interesse
        const colToKey = new Map<number, string>();
        for (let idx = 0; idx < headers.length; idx++) {
          const key = headers[idx];
          if (NEEDED_KEYS.has(key)) colToKey.set(idx, key);
        }

        // varre linhas abaixo do header
        for (let r = headerRow + 1; r <= range.e.r; r++) {
          const rec: Record<string, any> = {};
          let hasAny = false;

          for (const [idx, key] of colToKey.entries()) {
            const c = range.s.c + idx;
            const cell = sheet[xlsx.utils.encode_cell({ r, c })];
            const v = cell?.v;
            if (v !== undefined && v !== null && String(v).trim() !== '') {
              rec[key] = v;
              hasAny = true;
            }
          }

          if (!hasAny) continue;
          totalRows++;
          if (matchesCredential(rec)) kept.push(rec);
        }
      } else {
        throw new BadRequestException(
          `Tipo de arquivo não suportado: ${file.mimetype} (${file.originalname})`,
        );
      }
    } catch (err) {
      console.error('Erro ao ler arquivo:', err);
      throw new BadRequestException('Falha ao ler o arquivo. Verifique o formato e o layout.');
    }

    const dropped = Math.max(0, totalRows - kept.length);

    // mês de referência = 1º dia UTC do mês atual
    const now = new Date();
    const mesReferencia = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );

    // gravação
    let processedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      // sobrescreve importações do mesmo mês/cliente
      await tx.faturaImportada.deleteMany({ where: { clientId, mesReferencia } });

      for (const rec of kept) {
        const nome = ((): any => {
          for (const a of NAME_ALIASES) if (rec[a] != null && String(rec[a]).trim() !== '') return rec[a];
          return undefined;
        })();
        const cpfRaw = ((): any => {
          for (const a of CPF_ALIASES) if (rec[a] != null && String(rec[a]).trim() !== '') return rec[a];
          return undefined;
        })();
        const valorRaw = ((): any => {
          for (const a of VALOR_ALIASES) if (rec[a] != null && String(rec[a]).trim() !== '') return rec[a];
          return undefined;
        })();

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
            // Para reduzir ainda mais, você pode gravar apenas { credencial }:
            // raw: { credencial: pick(rec, CREDENCIAL_ALIASES) ?? null },
            raw: rec,
          },
        });

        processedCount++;
      }
    });

    const detect = (aliases: string[]) =>
      kept[0] ? aliases.find((a) => kept[0][a] !== undefined) ?? null : null;

    return {
      message: 'Fatura importada com sucesso.',
      processedRows: processedCount,
      totalRows,
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
    const ym =
      mes ||
      `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;

    const [year, month] = ym.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const whereBase = {
      clientId,
      mesReferencia: { gte: startDate, lt: endDate },
      ...(search
        ? {
            OR: [
              {
                nomeBeneficiarioOperadora: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
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
      hasMore: page * limit < totalCount,
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

  /**
   * Wrapper para compatibilidade com o controller novo.
   * - Se vier invoiceIds => delega para reconcileByIds (legado).
   * - Caso contrário, lança erro (fechamento/evolução ficam no ReconciliationService).
   */
  async reconcile(clientId: string, body: reconcileInvoicesDTO) {
    if (Array.isArray(body?.invoiceIds) && body.invoiceIds.length > 0) {
      return this.reconcileByIds(clientId, body.invoiceIds);
    }
    throw new BadRequestException(
      'Nada para reconciliar. Informe "invoiceIds" ou use os endpoints de conciliação/fechamento.',
    );
  }
}
