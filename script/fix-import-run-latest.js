// scripts/fix-import-run-latest.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const res = await prisma.importRun.updateMany({
      data: { latest: false },
    });
    console.log(`ImportRun: latest=false aplicado em ${res.count} linhas.`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
