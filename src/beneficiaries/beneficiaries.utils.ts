// Helpers separados para reuso no service

// Excel epoch corrige bug do "1900 leap"
const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));

function fromExcelSerial(n: number): Date {
  const d = new Date(EXCEL_EPOCH);
  d.setUTCDate(d.getUTCDate() + Math.floor(n));
  return d;
}

export function parseDateFlexible(raw: any): Date | null {
  if (raw == null) return null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = fromExcelSerial(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(raw).trim();
  if (!s) return null;

  // ISO direto
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  // DD/MM/YYYY ou DD-MM-YYYY
  const m1 = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (m1) {
    const [_, dd, mm, yyyy] = m1;
    const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    return isNaN(d.getTime()) ? null : d;
  }

  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
  if (m2) {
    const [_, yyyy, mm, dd] = m2;
    const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

export function normalizeTipoToEnum(raw: any): 'TITULAR' | 'CONJUGE' | 'FILHO' {
  const s = String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toUpperCase();

  if (s.startsWith('TITULAR')) return 'TITULAR';
  if (s.startsWith('CONJUGE')) return 'CONJUGE';
  if (s.startsWith('DEPENDENTE')) return 'FILHO'; // regra de negócio: dependente -> filho (ou ajuste)
  if (s.startsWith('FILHO')) return 'FILHO';
  return 'FILHO';
}
