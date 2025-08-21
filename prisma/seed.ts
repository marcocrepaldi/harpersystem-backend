/* prisma/seed.ts */
import 'dotenv/config';
import { PrismaClient, PersonType, ClientStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ---------- helpers ----------
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}
function sample<T>(arr: T[], min = 1, max = 3): T[] {
  const n = Math.min(arr.length, Math.max(min, Math.floor(Math.random() * (max - min + 1)) + min));
  return shuffle(arr).slice(0, n);
}
function randDigits(len: number): string {
  let s = '';
  while (s.length < len) s += Math.floor(Math.random() * 10);
  return s.slice(0, len);
}
function makeCpf(): string {
  // CPF “fake” só para dev (11 dígitos aleatórios)
  return randDigits(11);
}
function makeCnpj(): string {
  // CNPJ “fake” só para dev (14 dígitos aleatórios)
  return randDigits(14);
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- seeds fixos ----------
async function seedServices() {
  const services = [
    { slug: 'SAUDE', name: 'Plano de Saúde' },
    { slug: 'ODONTO', name: 'Plano Odontológico' },
    { slug: 'VIDA', name: 'Seguro de Vida' },
    { slug: 'AUTO', name: 'Seguro Auto' },
    { slug: 'RESIDENCIAL', name: 'Seguro Residencial' },
    { slug: 'VIAGEM', name: 'Seguro Viagem' },
    { slug: 'EMPRESARIAL', name: 'Seguro Empresarial' },
    { slug: 'RC', name: 'Responsabilidade Civil' },
    { slug: 'PATRIMONIAL', name: 'Seguro Patrimonial' },
    { slug: 'PET', name: 'Plano Pet' },
    { slug: 'ACIDENTES', name: 'Acidentes Pessoais' },
    { slug: 'FROTAS', name: 'Frotas' },
    { slug: 'EQUIPAMENTOS', name: 'Equipamentos' },
    { slug: 'RISCOS_INGENHARIA', name: 'Riscos de Engenharia' },
    { slug: 'CYBER', name: 'Seguro Cyber' },
  ];

  for (const svc of services) {
    await prisma.service.upsert({
      where: { slug: svc.slug },
      update: { name: svc.name, isActive: true },
      create: { slug: svc.slug, name: svc.name, isActive: true },
    });
  }
  console.log('✔ Services seeded');
}

async function seedTags() {
  const tags = [
    { slug: 'vip', name: 'Cliente VIP' },
    { slug: 'inadimplente', name: 'Inadimplente' },
    { slug: 'sinistro', name: 'Sinistro Recente' },
    { slug: 'potencial', name: 'Alto Potencial' },
    { slug: 'premium', name: 'Cliente Premium' },
    { slug: 'cancelado', name: 'Contrato Cancelado' },
    { slug: 'cross', name: 'Oportunidade Cross-Sell' },
    { slug: 'saude', name: 'Plano de Saúde' },
    { slug: 'auto', name: 'Seguro Auto' },
    { slug: 'vida', name: 'Seguro de Vida' },
  ];

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: { name: tag.name, isActive: true },
      create: { slug: tag.slug, name: tag.name, isActive: true },
    });
  }
  console.log('✔ Tags seeded');
}

// ---------- clientes fake ----------
type SeedClientOpts = {
  count?: number; // quantos clientes criar
  wipePreviousGenerated?: boolean; // excluir clientes gerados anteriormente (marcados por email que contém +seed)
};

async function seedClients({ count = 12, wipePreviousGenerated = false }: SeedClientOpts = {}) {
  // 1) pegar corretor existente (o primeiro)
  const corretor = await prisma.corretor.findFirst();
  if (!corretor) {
    console.log('⚠ Nenhum corretor encontrado. Crie um corretor/usuário antes do seed de clientes.');
    return;
  }

  // 2) serviços e tags ativas
  const services = await prisma.service.findMany({ where: { isActive: true } });
  const tags = await prisma.tag.findMany({ where: { isActive: true } });

  if (!services.length) throw new Error('Sem serviços ativos para vincular');
  if (!tags.length) throw new Error('Sem tags ativas para vincular');

  // 3) (opcional) limpar clientes gerados previamente
  if (wipePreviousGenerated) {
    const toDelete = await prisma.client.findMany({
      where: { corretorId: corretor.id, email: { contains: '+seed' }, deletedAt: null },
      select: { id: true },
    });
    if (toDelete.length) {
      await prisma.client.deleteMany({ where: { id: { in: toDelete.map((c) => c.id) } } });
      console.log(`⨯ Removidos ${toDelete.length} clientes gerados anteriormente`);
    }
  }

  // 4) geradores simples
  const firstNames = ['João', 'Maria', 'Ana', 'Pedro', 'Lucas', 'Mariana', 'Paula', 'Ricardo', 'Carla', 'Rafael'];
  const lastNames = ['Silva', 'Souza', 'Oliveira', 'Pereira', 'Santos', 'Rodrigues', 'Almeida', 'Ferreira', 'Gomes', 'Barbosa'];
  const companies = ['Acme', 'Globex', 'Umbrella', 'Initech', 'Hogarth', 'Wayne', 'Stark', 'Wonka', 'Oscorp', 'Nakatomi'];

  let created = 0;

  for (let i = 0; i < count; i++) {
    const isPF = Math.random() < 0.65; // 65% PF
    const status = pick<ClientStatus>([ClientStatus.ACTIVE, ClientStatus.LEAD, ClientStatus.PROSPECT, ClientStatus.INACTIVE]);

    // dados básicos
    const idx = randDigits(4);
    const email = isPF
      ? `cliente${idx}+seed@harper.dev`
      : `empresa${idx}+seed@harper.dev`;

    // tentar reaproveitar se já existir (idempotente por corretor+email)
    const existing = await prisma.client.findFirst({
      where: { corretorId: corretor.id, email },
      select: { id: true },
    });
    if (existing) {
      // já existe, pula
      continue;
    }

    // montar payload
    const chosenServices = sample(services, 1, 3);
    const chosenTags = sample(tags, 0, 2);

    const data: any = {
      corretor: { connect: { id: corretor.id } },
      status,
      email,
      phone: `55${randDigits(11)}`,
      preferences: { preferredChannel: pick(['email', 'phone', 'whatsapp', null]) },
      marketingOptIn: Math.random() < 0.5,
      privacyConsent: { accepted: true, at: new Date().toISOString() },

      // endereço legado mínimo
      addressZip: randDigits(8),
      addressStreet: `Rua ${titleCase(pick(lastNames))}`,
      addressNumber: `${Math.floor(Math.random() * 999) + 1}`,
      addressDistrict: `Bairro ${titleCase(pick(lastNames))}`,
      addressCity: 'São Paulo',
      addressState: 'SP',
      addressCountry: 'BR',
    };

    if (isPF) {
      const name = `${pick(firstNames)} ${pick(lastNames)}`;
      Object.assign(data, {
        personType: PersonType.PF,
        name,
        document: makeCpf(),
        pfRg: randDigits(9),
        pfMaritalStatus: pick(['solteiro', 'casado', 'divorciado', 'viuvo']),
        pfProfession: pick(['Analista', 'Vendedor', 'Engenheiro', 'Professor', 'Designer', 'Autônomo']),
        pfIsPEP: Math.random() < 0.1,
        primaryContactName: name,
        primaryContactEmail: email,
        primaryContactPhone: `55${randDigits(11)}`,
      });
    } else {
      const fantasy = `${pick(companies)} ${titleCase(pick(lastNames))}`;
      Object.assign(data, {
        personType: PersonType.PJ,
        name: fantasy,
        document: makeCnpj(), // document unificado
        pjCorporateName: `${fantasy} LTDA`,
        pjTradeName: fantasy,
        pjCnpj: makeCnpj(),
        pjStateRegistration: randDigits(12),
        pjMunicipalRegistration: randDigits(10),
        pjCNAE: '6201-5/01',
        pjRepName: `${pick(firstNames)} ${pick(lastNames)}`,
        pjRepCpf: makeCpf(),
        pjRepEmail: `rep${idx}+seed@harper.dev`,
        pjRepPhone: `55${randDigits(11)}`,
        primaryContactName: `Contato ${titleCase(pick(firstNames))}`,
        primaryContactEmail: `contato${idx}+seed@harper.dev`,
        primaryContactPhone: `55${randDigits(11)}`,
      });
    }

    // criar cliente + relações N:N
    await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          ...data,
          services: {
            create: chosenServices.map((s) => ({ service: { connect: { id: s.id } } })),
          },
          tagLinks: {
            create: chosenTags.map((t) => ({ tag: { connect: { id: t.id } } })),
          },
        },
      });

      // opcional: endereço/contato normalizados (Fase A) — exemplo mínimo
      await tx.address.create({
        data: {
          clientId: client.id,
          type: 'COBRANCA',
          zip: data.addressZip,
          street: data.addressStreet,
          number: data.addressNumber,
          district: data.addressDistrict,
          city: data.addressCity,
          state: data.addressState,
          country: data.addressCountry ?? 'BR',
        },
      });

      await tx.contact.create({
        data: {
          clientId: client.id,
          name: data.primaryContactName ?? client.name,
          email: data.primaryContactEmail ?? client.email,
          phone: data.primaryContactPhone ?? client.phone,
          isPrimary: true,
        },
      });
    });

    created++;
  }

  console.log(`✔ Clients seeded (${created} novo[s])`);
}

// ---------- main ----------
async function main() {
  // permite passar quantidade via argumento: `npm run db:seed -- 15`
  const argN = parseInt(process.argv[2] ?? '', 10);
  const howMany = Number.isFinite(argN) ? Math.max(1, argN) : 12;

  await seedServices();
  await seedTags();
  await seedClients({ count: howMany, wipePreviousGenerated: false });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
