import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as Papa from 'papaparse';
import * as xlsx from 'xlsx';
import * as chardet from 'jschardet';
import * as iconv from 'iconv-lite';

type ParsedRow = {
  nome: string;
  cpf: string;
  valor: string; // "1234.56" (string segura p/ Decimal)
  raw: Record<string, any>;
  rowIndex: number;
};

type ImportResult = {
  ok: boolean;
  clientId: string;
  mesReferencia: string; // YYYY-MM-01
  file: { name?: string; size: number; mimetype: string };
  totals: { totalRows: number; processed: number; skipped: number; invalidCpf: number; invalidValor: number };
  errors: Array<{ row: number; reason: string }>;
  sampleParsedKeys: string[]; // NOVO: chaves detectadas após parse (sempre preenchido)
};

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async processInvoiceUpload(clientId: string, file: Express.Multer.File, mesReferenciaInput?: Date): Promise<ImportResult> {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');

    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    const mesReferencia = mesReferenciaInput ?? this.currentMonthUTC();
    const mesRefISOString = this.formatYYYYMM01(mesReferencia);

    const { mimetype, originalname, size, buffer } = file;
    const nameLower = (originalname || '').toLowerCase();
    const isCsv = mimetype === 'text/csv' || nameLower.endsWith('.csv');
    const isXlsx = mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || nameLower.endsWith('.xlsx');
    const isXls = mimetype === 'application/vnd.ms-excel' || nameLower.endsWith('.xls');

    let records: Array<Record<string, any>> = [];
    try {
      if (isCsv) {
        const decoded = this.decodeBuffer(buffer); // utf-8/latin1 etc.
        const delimiter = decoded.includes(';') ? ';' : ',';
        const parsed = Papa.parse(decoded, { header: true, skipEmptyLines: true, delimiter });
        records = Array.isArray(parsed.data) ? (parsed.data as any[]) : [];
      } else if (isXlsx || isXls) {
        const wb = xlsx.read(buffer, { type: 'buffer', cellDates: true });
        const sheet = wb.SheetNames[0];
        records = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { defval: null }) as any[];
      } else {
        throw new BadRequestException(`Tipo de arquivo não suportado: ${mimetype}`);
      }
    } catch {
      throw new BadRequestException('Falha ao ler o arquivo. Verifique o formato e a codificação.');
    }

    if (!records.length) throw new BadRequestException('Nenhuma linha encontrada na planilha.');

    // Guarda amostra de chaves vistas no parse (antes de validar/salvar)
    const sampleParsedKeys = Array.from(
      new Set(
        records.slice(0, 10).flatMap((r) => Object.keys(r || {}).map(String)),
      ),
    ).slice(0, 60);

    // ===== Normalização com mapeamento + heurísticas =====
    const normalized = this.normalizeRows(records);

    let processed = 0;
    let skipped = 0;
    let invalidCpf = 0;
    let invalidValor = 0;
    const errors: Array<{ row: number; reason: string }> = [];

    const validRows: ParsedRow[] = [];
    for (const row of normalized) {
      const cpf = row.cpf.replace(/\D/g, '');
      const valorOk = this.isValidMoney(row.valor);
      if (cpf.length !== 11) {
        invalidCpf++; skipped++; errors.push({ row: row.rowIndex, reason: 'CPF inválido (11 dígitos)' });
        continue;
      }
      if (!valorOk) {
        invalidValor++; skipped++; errors.push({ row: row.rowIndex, reason: 'Valor inválido' });
        continue;
      }
      validRows.push({
        nome: (row.nome || '').trim(),
        cpf,
        valor: this.normalizeMoneyToString(row.valor),
        raw: row.raw,
        rowIndex: row.rowIndex,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.faturaImportada.deleteMany({ where: { clientId, mesReferencia } });

      if (!validRows.length) return;

      const data = validRows.map((r) => ({
        clientId,
        mesReferencia,
        nomeBeneficiarioOperadora: r.nome,
        cpfBeneficiarioOperadora: r.cpf,
        valorCobradoOperadora: r.valor, // string "1234.56" para Decimal
        statusConciliacao: 'PENDENTE',
        raw: r.raw,
      }));

      const batchSize = 1000;
      for (let i = 0; i < data.length; i += batchSize) {
        const chunk = data.slice(i, i + batchSize);
        await tx.faturaImportada.createMany({ data: chunk });
        processed += chunk.length;
      }
    });

    return {
      ok: true,
      clientId,
      mesReferencia: mesRefISOString,
      file: { name: originalname, size, mimetype },
      totals: { totalRows: records.length, processed, skipped, invalidCpf, invalidValor },
      errors: errors.slice(0, 50),
      sampleParsedKeys, // <- sempre vem preenchido
    };
  }

  // ========= GET auxiliar para conciliação =========
  async getImportedForMonth(clientId: string, mesReferenciaInput?: Date) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    const mesReferencia = mesReferenciaInput ?? this.currentMonthUTC();

    const [items, count, soma] = await this.prisma.$transaction([
      this.prisma.faturaImportada.findMany({
        where: { clientId, mesReferencia },
        orderBy: [{ nomeBeneficiarioOperadora: 'asc' }, { cpfBeneficiarioOperadora: 'asc' }],
        select: {
          id: true,
          nomeBeneficiarioOperadora: true,
          cpfBeneficiarioOperadora: true,
          valorCobradoOperadora: true,
          statusConciliacao: true,
          raw: true,
        },
      }),
      this.prisma.faturaImportada.count({ where: { clientId, mesReferencia } }),
      this.prisma.faturaImportada.aggregate({ where: { clientId, mesReferencia }, _sum: { valorCobradoOperadora: true } }),
    ]);

    // quando nada foi salvo, não temos RAW aqui; por isso passamos sampleParsedKeys no upload
    return {
      ok: true,
      clientId,
      mesReferencia: this.formatYYYYMM01(mesReferencia),
      totals: {
        importedCount: count,
        importedSum: soma._sum.valorCobradoOperadora ?? '0',
      },
      sampleRawKeys: [], // mantido para compatibilidade com o front atual
      items: items.map((r) => ({
        id: r.id,
        nome: r.nomeBeneficiarioOperadora ?? '',
        cpf: r.cpfBeneficiarioOperadora ?? '',
        valor: r.valorCobradoOperadora,
        status: r.statusConciliacao ?? 'PENDENTE',
      })),
    };
  }

  // ================= Helpers =================

  private currentMonthUTC(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  }
  private formatYYYYMM01(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  }

  /** Detecta encoding (jschardet) e decodifica (iconv). Fallback: utf-8. */
  private decodeBuffer(buf: Buffer): string {
    const det = chardet.detect(buf);
    const enc = det?.encoding?.toLowerCase() || 'utf-8';
    if (enc === 'utf-8' || enc === 'ascii') return buf.toString('utf-8');
    try {
      return iconv.decode(buf, enc as any);
    } catch {
      return buf.toString('utf-8');
    }
  }

  /** Normaliza linhas procurando cabeçalhos e, se necessário, usando heurísticas por conteúdo. */
  private normalizeRows(records: Array<Record<string, any>>) {
    const aliases = {
      nome: [
        'beneficiario','beneficiário','nome','nome_beneficiario','nome do beneficiario',
        'nome beneficiario','titular','beneficiario_nome','nm_beneficiario','nome do titular'
      ],
      cpf: [
        'cpf','documento','cpf do beneficiario','cpf_beneficiario','cpf beneficiario','nr_cpf','cpf titular'
      ],
      valor: [
        'cobrado','valor','valor cobrado','valor_cobrado','premio','prêmio',
        'valor_premio','mensalidade','vl_mensalidade','valor_total','vl_total','vl_cobrado'
      ],
    };

    const normKey = (s: string) =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

    const lowerObjs = records.map((r) => {
      const o: Record<string, any> = {};
      Object.keys(r || {}).forEach((k) => (o[normKey(k)] = (r as any)[k]));
      return o;
    });

    const findKey = (obj: Record<string, any>, keys: string[]) => {
      // match exato
      for (const k of keys) {
        const nk = normKey(k);
        if (nk in obj) return nk;
      }
      // contém/parecido
      const oks = Object.keys(obj);
      for (const k of keys) {
        const nk = normKey(k);
        const found = oks.find((ok) => ok.includes(nk));
        if (found) return found;
      }
      return undefined;
    };

    const cpfFromAny = (o: Record<string, any>, excludeKeys: string[] = []) => {
      for (const [k, v] of Object.entries(o)) {
        if (excludeKeys.includes(k)) continue;
        const onlyDigits = String(v ?? '').replace(/\D/g, '');
        if (onlyDigits.length === 11) return onlyDigits;
      }
      return '';
    };

    const moneyLike = (v: any) => {
      if (v == null) return false;
      const s = String(v).trim();
      if (!s) return false;
      // remove R$, espaços, milhares e normaliza vírgula
      const normalized = s
        .replace(/R\$\s?/i, '')
        .replace(/\s+/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .replace(/-$/, ''); // "123,45-" → 123,45
      return /^-?\d+(\.\d{1,2})?$/.test(normalized);
    };

    const valorFromAny = (o: Record<string, any>, excludeKeys: string[] = []) => {
      for (const [k, v] of Object.entries(o)) {
        if (excludeKeys.includes(k)) continue;
        if (moneyLike(v)) return String(v);
      }
      return '';
    };

    const nomeFromAny = (o: Record<string, any>, exclude: string[] = []) => {
      // escolhe a primeira string razoável que não seja cpf/valor
      for (const [k, v] of Object.entries(o)) {
        if (exclude.includes(k)) continue;
        if (typeof v === 'string') {
          const s = v.trim();
          if (s && s.length >= 3 && !/\d{11}/.test(s)) return s;
        }
      }
      // fallback: junta campos de texto
      const texts = Object.values(o).filter((v) => typeof v === 'string' && v.trim().length >= 3) as string[];
      return texts[0] ?? '';
    };

    return lowerObjs.map((row, idx) => {
      // 1) tenta achar por alias
      let nomeKey = findKey(row, aliases.nome);
      let cpfKey = findKey(row, aliases.cpf);
      let valorKey = findKey(row, aliases.valor);

      // 2) valores
      const nomeVal = nomeKey ? String(row[nomeKey] ?? '') : '';
      const cpfVal = cpfKey ? String(row[cpfKey] ?? '') : '';
      const valorVal = valorKey ? String(row[valorKey] ?? '') : '';

      let nome = nomeVal;
      let cpf = cpfVal;
      let valor = valorVal;

      // 3) se não achou, heurísticas por conteúdo
      const exclude: string[] = [nomeKey, cpfKey, valorKey].filter(Boolean) as string[];

      if (!cpf || cpf.replace(/\D/g, '').length !== 11) {
        cpf = cpfFromAny(row, exclude);
      }
      if (!valor || !moneyLike(valor)) {
        valor = valorFromAny(row, exclude);
      }
      if (!nome || nome.length < 3) {
        nome = nomeFromAny(row, exclude);
      }

      return { nome, cpf, valor, raw: records[idx], rowIndex: idx + 1 };
    });
  }

  /** Aceita: "R$ 1.234,56", "1.234,56-", "1234.56" etc. */
  private isValidMoney(input: string): boolean {
    const s = String(input ?? '').trim();
    if (!s) return false;
    const normalized = s
      .replace(/R\$\s?/i, '')
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/-$/, ''); // "123,45-" -> "123,45"
    return /^-?\d+(\.\d{1,2})?$/.test(normalized);
  }

  /** "R$ 1.234,56" -> "1234.56" (string p/ Decimal). */
  private normalizeMoneyToString(input: string): string {
    const s = String(input ?? '').trim();
    const normalized = s
      .replace(/R\$\s?/i, '')
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/-$/, ''); // "123,45-" -> "123,45"
    const [intPart, fracPart = ''] = normalized.split('.');
    const frac = fracPart.length === 0 ? '00' : fracPart.length === 1 ? `${fracPart}0` : fracPart.slice(0, 2);
    return `${intPart}.${frac}`;
  }
}
