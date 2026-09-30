import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.emailJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('--- EmailJob statuses ---');
  jobs.forEach(j => {
    console.log(`id=${j.id} status=${j.status} scheduledFor=${j.scheduledFor.toISOString()}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
