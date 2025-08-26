import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const regras = await prisma.regraCobranca.findMany();

  for (const regra of regras) {
    await prisma.regraCobranca.update({
      where: { id: regra.id },
      data: {
        policy: {
          proRata: true, // calcula proporcional no 1º mês
          considerarVigencia: true, // usa campo "dataEntrada" do beneficiário
          toleranciaCentavos: 0.05, // ignora diferenças < 5 centavos
          cobrarSomenteApartirVigencia: true, // ignora beneficiários com início futuro
        },
      },
    });
  }
}

main()
  .then(() => {
    console.log("✅ Seed aplicado com sucesso!");
  })
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
