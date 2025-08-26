// Aceita "YYYY-MM" (preferido), "MM/YYYY" e até datas ISO, devolvendo um range fechado-aberto
export function normalizeMes(mes?: string) {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-11

  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    y = Number(mes.slice(0, 4));
    m = Number(mes.slice(5, 7)) - 1;
  } else if (mes && /^\d{2}\/\d{4}$/.test(mes)) {
    m = Number(mes.slice(0, 2)) - 1;
    y = Number(mes.slice(3, 7));
  } else if (mes) {
    // tenta parsear como data
    const d = new Date(mes);
    if (!isNaN(d.getTime())) {
      y = d.getFullYear();
      m = d.getMonth();
    }
  }

  const from = new Date(y, m, 1, 0, 0, 0, 0);
  const to = new Date(y, m + 1, 1, 0, 0, 0, 0);
  const ym = `${y}-${String(m + 1).padStart(2, '0')}`;

  return { ym, from, to, year: y, month: m + 1 };
}
