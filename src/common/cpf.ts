// src/common/cpf.ts

/**
 * Normaliza CPF para string de 11 dígitos, preservando zeros à esquerda.
 * Caso seja inválido, retorna null.
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
