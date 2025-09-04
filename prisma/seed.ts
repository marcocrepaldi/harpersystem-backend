import { PrismaClient, InsuranceLine } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const carriers = [
    { slug: 'amil', tradeName: 'Amil', legalName: 'AMIL ASSISTÊNCIA MÉDICA INTERNACIONAL S.A.', lines: [InsuranceLine.HEALTH] },
    { slug: 'bradesco-saude', tradeName: 'Bradesco Saúde', legalName: 'BRADESCO SAÚDE S.A.', lines: [InsuranceLine.HEALTH] },
    { slug: 'sulamerica', tradeName: 'SulAmérica Saúde', legalName: 'SUL AMÉRICA COMPANHIA DE SEGURO SAÚDE', lines: [InsuranceLine.HEALTH] },
    { slug: 'hapvida', tradeName: 'Hapvida', legalName: 'HAPVIDA ASSISTÊNCIA MÉDICA LTDA.', lines: [InsuranceLine.HEALTH] },
    { slug: 'notredame', tradeName: 'NotreDame Intermédica', legalName: 'NOTRE DAME INTERMÉDICA SAÚDE S.A.', lines: [InsuranceLine.HEALTH] },
  ];
  for (const c of carriers) {
    await prisma.insurer.upsert({
      where: { slug: c.slug },
      update: { tradeName: c.tradeName, legalName: c.legalName, lines: c.lines },
      create: { slug: c.slug, tradeName: c.tradeName, legalName: c.legalName, lines: c.lines },
    });
  }
}
main().finally(() => prisma.$disconnect());
