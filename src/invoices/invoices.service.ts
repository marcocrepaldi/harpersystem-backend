import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Papa from 'papaparse';
import * as xlsx from 'xlsx';
import { listImportedInvoicesDTO, reconcileInvoicesDTO } from './dto/invoices.dto';

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

  private normName(s: any) {
    return String(s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  /** Converte valores BR/US e parênteses negativos. */
  private toNumberSmart(raw: any): number {
    if (raw == null) return NaN;
    if (typeof raw === 'number') return raw;

    let s = String(raw).trim();
    if (!s) return NaN;

    s = s.replace(/r\$\s*/i, '').replace(/\s+/g, '');

    const negative = /^\(.*\)$/.test(s);
    if (negative) s = s.slice(1, -1);

    // só dígitos: assume centavos se >= 3 dígitos
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      const val = s.length >= 3 ? n / 100 : n;
      return negative ? -val : val;
    }

    // heurística separadores
    if (s.includes(',') && s.includes('.')) {
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
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
      'parentesco', // ajuda a achar header cedo
      'tipo_usuario',
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

  /** Filtro estrito por credencial: allow por prefixo, deny por prefixos proibidos + scan de tokens 0TA*** */
  private matchesCredentialStrict(
    rec: Record<string, any>,
    allowedPrefix: string,
    aliases: string[],
  ): boolean {
    const norm = (v: any) => String(v ?? '').trim().toUpperCase();
    const ALLOWED = norm(allowedPrefix);
    const DENY = (process.env.INVOICE_CREDENTIAL_DENY_PREFIXES || '')
      .split(',')
      .map((s) => norm(s))
      .filter(Boolean);

    // candidatos pelos aliases
    const fromAliases = aliases
      .map((a) => rec[a])
      .filter((v) => v !== undefined && String(v).trim() !== '')
      .map(norm);

    // scan geral por tokens 0TAxxx (0TATM, 0TAYS etc.)
    const tokenRe = /\b0TA[A-Z0-9]+/g;
    const fromScan: string[] = [];
    for (const v of Object.values(rec)) {
      const s = norm(v);
      if (!s) continue;
      const m = s.match(tokenRe);
      if (m) fromScan.push(...m.map(norm));
    }

    const candidates = [...new Set([...fromAliases, ...fromScan])];
    if (candidates.length === 0) return false;

    // deny: se qualquer candidato tem prefixo proibido -> rejeita
    if (DENY.length && candidates.some((c) => DENY.some((d) => c.startsWith(d)))) {
      return false;
    }

    // allow: precisa ter ao menos um com o prefixo permitido
    if (candidates.some((c) => c.startsWith(ALLOWED))) return true;

    // se apareceu algum 0TA***, mas diferente do permitido, rejeita
    if (candidates.some((c) => /^0TA[A-Z0-9]+/.test(c))) return false;

    // sem 0TA***, rejeita por segurança
    return false;
  }

  private isTitularWord(s: any) {
    const t = this.normName(s);
    return t.startsWith('TITULAR');
  }
  private isDependentWord(s: any) {
    const t = this.normName(s);
    // cobre FILHO(A), CONJUGE, DEPENDENTE, ENTEADO, etc.
    return !this.isTitularWord(t);
  }

  /* ------------------------------- main ------------------------------------ */

  /**
   * Importa arquivo e grava em FaturaImportada (1 linha/beneficiário).
   * Filtra por credencial com regra estrita (allow/deny).
   * Deduplica por CPF priorizando a linha de valor 0.
   * Corrige CPF de dependente "copiado" do titular usando o cadastro.
   */
  async processInvoiceUpload(
    clientId: string,
    file: Express.Multer.File,
    insurerId?: string,
  ) {
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
      'carteirinha',
    ].map((k) => this.normalizeKey(k));

    // NOVO: precisamos saber se a linha é TITULAR/DEPENDENTE
    const PARENTESCO_ALIASES = [
      'parentesco',
      'grau_parentesco',
      'grauparentesco',
      'tipo_usuario', // muitos layouts usam "Tipo_Usuario"
      'tipo',
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

    const NEEDED_KEYS = new Set([
      ...NAME_ALIASES,
      ...CPF_ALIASES,
      ...VALOR_ALIASES,
      ...CREDENCIAL_ALIASES,
      ...PARENTESCO_ALIASES, // garante que teremos o "tipo" da linha
      'empresa', // comum no header "empresa"
    ]);

    const normalizeNeeded = (obj: Record<string, any>) => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        const nk = this.normalizeKey(k);
        if (NEEDED_KEYS.has(nk)) out[nk] = v;
      }
      return out;
    };

    const matchesCredential = (rec: Record<string, any>) =>
      this.matchesCredentialStrict(rec, REQUIRED_PREFIX, CREDENCIAL_ALIASES);

    // leitura + filtro
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
          'empresa',
          'parentesco',
          'tipo_usuario',
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

        const headers: string[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = sheet[xlsx.utils.encode_cell({ r: headerRow, c })];
          headers.push(this.normalizeKey(String(cell?.v ?? '')));
        }

        const colToKey = new Map<number, string>();
        for (let idx = 0; idx < headers.length; idx++) {
          const key = headers[idx];
          if (NEEDED_KEYS.has(key)) colToKey.set(idx, key);
        }

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

    /* ===== NOVO: corrigir CPF de dependente usando o cadastro =====
       Regra: se a linha for de dependente e o CPF vier igual ao do titular anterior,
       tento achar no cadastro (desse cliente) um dependente com MESMO NOME e cujo
       TITULAR tenha este CPF. Se achar 1 único -> substituo o CPF da linha. */

    // índice do cadastro
    const bens = await this.prisma.beneficiario.findMany({
      where: { clientId },
      select: { id: true, nomeCompleto: true, cpf: true, tipo: true, titularId: true },
    });
    const idToCpf = new Map<string, string>();
    for (const b of bens) if (b.id && b.cpf) idToCpf.set(b.id, b.cpf);

    const depByTitularCpfAndName = new Map<string, Map<string, string>>(); // titularCpf -> (NOME -> cpfDep)
    const byNameAll = new Map<string, { cpf: string; tipo: string }[]>();

    for (const b of bens) {
      if (b.nomeCompleto && b.cpf) {
        const nk = this.normName(b.nomeCompleto);
        const arr = byNameAll.get(nk) ?? [];
        arr.push({ cpf: b.cpf, tipo: b.tipo });
        byNameAll.set(nk, arr);
      }
      if (b.tipo !== 'TITULAR' && b.cpf && b.titularId) {
        const tCpf = idToCpf.get(b.titularId);
        if (tCpf) {
          const n = this.normName(b.nomeCompleto ?? '');
          if (n) {
            const m = depByTitularCpfAndName.get(tCpf) ?? new Map<string, string>();
            m.set(n, b.cpf);
            depByTitularCpfAndName.set(tCpf, m);
          }
        }
      }
    }

    let lastTitularCpf: string | null = null;

    for (const rec of kept) {
      const nome = pick(rec, NAME_ALIASES);
      const parentesco = pick(rec, PARENTESCO_ALIASES);
      const cpfDigits = this.cleanCPF(String(pick(rec, CPF_ALIASES) ?? ''));

      if (this.isTitularWord(parentesco)) {
        lastTitularCpf = cpfDigits || null;
        continue;
      }

      // dependente:
      if (!this.isDependentWord(parentesco)) continue; // sanity

      // só tenta corrigir se veio igual ao do último titular
      if (cpfDigits && lastTitularCpf && cpfDigits === lastTitularCpf && nome) {
        const nk = this.normName(nome);
        let fixedCpf: string | undefined;

        // 1) preferencial: dependente cujo titular tem esse CPF
        const mapByName = depByTitularCpfAndName.get(lastTitularCpf);
        fixedCpf = mapByName?.get(nk);

        // 2) fallback: nome único no cadastro (não titular)
        if (!fixedCpf) {
          const candidates = (byNameAll.get(nk) || []).filter((x) => x.tipo !== 'TITULAR');
          if (candidates.length === 1) fixedCpf = candidates[0].cpf;
        }

        if (fixedCpf && fixedCpf !== lastTitularCpf) {
          // marca override para o prepared usar
          (rec as any)._cpfOverride = fixedCpf;
        }
      }
    }

    // ====== PREPARO + DEDUP POR CPF ======
    type Prepared = {
      rec: Record<string, any>;
      cpf: string;
      key: string;          // = cpf
      nome: any;
      rawValor: any;
      parsedValor: number;  // vazio/NaN -> 0
      isDuplicate: boolean;
    };

    const prepared: Prepared[] = kept
      .map((rec) => {
        const nome = pick(rec, NAME_ALIASES);

        // usa override se existir
        const cpfPicked = pick(rec, CPF_ALIASES);
        const cpfFromOverride = (rec as any)._cpfOverride;
        const cpfRaw = cpfFromOverride ?? cpfPicked;

        if (!cpfRaw) return null;
        const cpf = this.cleanCPF(String(cpfRaw));
        if (cpf.length !== 11) return null;

        const valorRaw = pick(rec, VALOR_ALIASES);

        // vazio/NaN -> 0
        let parsed = 0;
        if (!(valorRaw == null || String(valorRaw).trim() === '')) {
          const n = this.toNumberSmart(valorRaw);
          parsed = Number.isNaN(n) ? 0 : n;
        }

        const key = cpf;

        return {
          rec,
          cpf,
          key,
          nome,
          rawValor: valorRaw,
          parsedValor: parsed,
          isDuplicate: false,
        } as Prepared;
      })
      .filter((p): p is Prepared => !!p);

    // Grupos por CPF; manter 1 linha com valor === 0 se existir; senão a primeira.
    const groups = new Map<string, Prepared[]>();
    for (const p of prepared) {
      if (!groups.has(p.key)) groups.set(p.key, []);
      groups.get(p.key)!.push(p);
    }

    for (const arr of groups.values()) {
      let primaryIndex = arr.findIndex((x) => x.parsedValor === 0);
      if (primaryIndex === -1) primaryIndex = 0;

      arr.forEach((x, idx) => {
        if (idx !== primaryIndex) {
          x.isDuplicate = true;
          x.parsedValor = 0;
          x.rec._duplicate = true;
        }
      });
    }

    // mês de referência = 1º dia UTC do mês atual
    const now = new Date();
    const mesReferencia = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );

    // gravação
    let processedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.faturaImportada.deleteMany({
        where: {
          clientId,
          mesReferencia,
          ...(insurerId ? { insurerId } : { insurerId: null }),
        },
      });

      for (const p of prepared) {
        await tx.faturaImportada.create({
          data: {
            cliente: { connect: { id: clientId } },
            ...(insurerId ? { insurer: { connect: { id: insurerId } } } : {}),
            mesReferencia,
            nomeBeneficiarioOperadora: (p.nome ?? '').toString() || null,
            cpfBeneficiarioOperadora: p.cpf,             // <- já corrigido se houve override
            valorCobradoOperadora: p.parsedValor,        // deduplicado (duplicados = 0)
            statusConciliacao: 'pendente',
            raw: p.rec,
          },
        });
        processedCount++;
      }
    });

    const detect = (aliases: string[]) =>
      prepared[0]?.rec ? aliases.find((a) => prepared[0]!.rec[a] !== undefined) ?? null : null;

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
        parentesco: detect(PARENTESCO_ALIASES),
      },
      dedup: {
        grupos: groups.size,
        duplicados: prepared.filter((p) => p.isDuplicate).length,
      },
      mesReferencia: `${mesReferencia.getUTCFullYear()}-${String(
        mesReferencia.getUTCMonth() + 1,
      ).padStart(2, '0')}`,
      insurerId: insurerId ?? null,
    };
  }

  /**
   * Lista faturas importadas do mês, com paginação e (opcional) busca simples.
   * Se `insurerId` for informado, filtra por operadora; caso contrário, traz todas.
   */
  async listImported(
    clientId: string,
    { mes, page = 1, limit = 100, search }: listImportedInvoicesDTO,
    insurerId?: string,
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
      ...(insurerId ? { insurerId } : {}),
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
      insurerId: insurerId ?? null,
    };
  }

  /** Remove importações do mês/cliente (opcionalmente por operadora). */
  async deleteInvoiceByMonth(clientId: string, mesReferencia: Date, insurerId?: string) {
    const where = { clientId, mesReferencia, ...(insurerId ? { insurerId } : {}) };
    const { count } = await this.prisma.faturaImportada.deleteMany({ where });
    return {
      message: `Foram deletadas ${count} faturas do mês de referência${insurerId ? ` (operadora ${insurerId})` : ''}.`,
      deletedCount: count,
    };
  }

  /** Marca um conjunto de linhas como conciliadas. */
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

  /** Wrapper legado. */
  async reconcile(clientId: string, body: reconcileInvoicesDTO) {
    if (Array.isArray(body?.invoiceIds) && body.invoiceIds.length > 0) {
      return this.reconcileByIds(clientId, body.invoiceIds);
    }
    throw new BadRequestException(
      'Nada para reconciliar. Informe "invoiceIds" ou use os endpoints de conciliação/fechamento.',
    );
  }
}
