// src/common/cpf.ts

/**
 * Normaliza CPF para string de 11 dígitos, preservando zeros à esquerda.
 * Caso seja inválido no formato, retorna null (não checa DV).
 */
export function normalizeCpf(raw: unknown): string | null {
  if (raw == null) return null;

  // Remove tudo que não for dígito
  let s = String(raw).replace(/\D/g, "");

  // Se vier com menos de 11, preenche com zeros à esquerda
  if (s.length <= 11) s = s.padStart(11, "0");

  // Se não tiver exatamente 11 dígitos, CPF inválido
  if (s.length !== 11) return null;

  return s;
}

/**
 * Valida CPF pelo algoritmo oficial.
 * Retorna true se for válido, false caso contrário.
 */
export function isValidCpf(cpfRaw: unknown): boolean {
  const cpf = normalizeCpf(cpfRaw);
  if (!cpf) return false;

  // Rejeita sequências de números repetidos
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  // Calcula 1º dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let dig1 = 11 - (sum % 11);
  if (dig1 >= 10) dig1 = 0;
  if (dig1 !== Number(cpf[9])) return false;

  // Calcula 2º dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  let dig2 = 11 - (sum % 11);
  if (dig2 >= 10) dig2 = 0;

  return dig2 === Number(cpf[10]);
}

/* =========================================================
 * NOVO: normalização "inteligente" para import e payload
 * =======================================================*/

export type CpfStatus = 'valid' | 'invalid' | 'adjusted' | 'missing';

export type NormalizedCpf = {
  /** exatamente o que veio do layout (podendo ter letras, pontos, notação científica etc.) */
  raw: string | null;
  /** 11 dígitos se válido/ajustado; senão null */
  clean: string | null;
  status: CpfStatus;
  message?: string;
};

/** mantém só dígitos (sem padStart) */
export function onlyDigits(v?: string | null): string {
  return (v ?? '').replace(/\D+/g, '');
}

/**
 * Regras do import:
 * - Preserva o raw do layout.
 * - Se não houver dígitos → status 'missing'.
 * - Se < 11 dígitos → tenta padStart(11,'0') e valida DV:
 *    - se ok → status 'adjusted' com clean ajustado
 *    - se não → 'invalid' com clean=null
 * - Se = 11 → valida DV:
 *    - ok → 'valid'
 *    - não → 'invalid'
 * - Se > 11 → 'invalid'
 */
export function normalizeCpfFromLayout(input?: string | null): NormalizedCpf {
  const raw = (input ?? '').trim();
  const digits = onlyDigits(raw);

  if (digits.length === 0) {
    return { raw: raw || null, clean: null, status: 'missing', message: 'CPF ausente no layout' };
  }

  if (digits.length < 11) {
    const padded = digits.padStart(11, '0');
    if (isValidCpf(padded)) {
      return {
        raw,
        clean: padded,
        status: 'adjusted',
        message: `CPF veio com ${digits.length} dígitos; ajustado com zeros à esquerda`
      };
    }
    return {
      raw,
      clean: null,
      status: 'invalid',
      message: `CPF com ${digits.length} dígitos; ajuste com zeros à esquerda não passou no DV`
    };
  }

  if (digits.length > 11) {
    return {
      raw,
      clean: null,
      status: 'invalid',
      message: `CPF com ${digits.length} dígitos após limpar (esperado: 11)`
    };
  }

  // exatamente 11 dígitos
  if (isValidCpf(digits)) {
    return { raw, clean: normalizeCpf(digits)!, status: 'valid' };
  }
  return { raw, clean: null, status: 'invalid', message: 'CPF com 11 dígitos, porém DV inválido' };
}

/* =========================================================
 * NOVO: helpers de apresentação/comparação
 * =======================================================*/

/** Formata para XXX.XXX.XXX-XX; se não der para formatar, retorna null */
export function formatCpf(raw: unknown): string | null {
  const clean = normalizeCpf(raw);
  if (!clean) return null;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
}

/** Compara dois CPFs ignorando máscara/pontos */
export function digitsEqual(a: unknown, b: unknown): boolean {
  const da = onlyDigits(String(a ?? ''));
  const db = onlyDigits(String(b ?? ''));
  return da === db && da.length > 0;
}
