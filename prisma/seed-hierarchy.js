const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const testMembers = [
  {
    name: 'Enzo Ferreira',
    email: 'presidente@scitecjr.com.br',
    role: 'PRESIDENTE',
    primaryDept: 'GLOBAL',
    cargo: 'Presidente Institucional',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
  },
  {
    name: 'Gabriel Santos',
    email: 'gerente.negocios@scitecjr.com.br',
    role: 'GERENTE',
    primaryDept: 'NEGOCIOS',
    cargo: 'Gerente de Negócios',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
  },
  {
    name: 'Lucas Mendes',
    email: 'assessor.negocios@scitecjr.com.br',
    role: 'ASSESSOR',
    primaryDept: 'NEGOCIOS',
    cargo: 'Assessor de Negócios',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
  },
  {
    name: 'Larissa Albuquerque',
    email: 'gerente.midias@scitecjr.com.br',
    role: 'GERENTE',
    primaryDept: 'MIDIAS',
    cargo: 'Gerente de Mídias',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
  },
  {
    name: 'Mariana Duarte',
    email: 'assessora.midias@scitecjr.com.br',
    role: 'ASSESSOR',
    primaryDept: 'MIDIAS',
    cargo: 'Assessora de Mídias',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
  },
  {
    name: 'Beatriz Rezende',
    email: 'gerente.admjurfin@scitecjr.com.br',
    role: 'GERENTE',
    primaryDept: 'ADMJURFIN',
    cargo: 'Gerente de AdmJurFin',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
  },
  {
    name: 'Rodrigo Faria',
    email: 'assessor.admjurfin@scitecjr.com.br',
    role: 'ASSESSOR',
    primaryDept: 'ADMJURFIN',
    cargo: 'Assessor de AdmJurFin',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150',
  },
  {
    name: 'Rafael Toledo',
    email: 'gerente.gente@scitecjr.com.br',
    role: 'GERENTE',
    primaryDept: 'GENTE',
    cargo: 'Gerente de Gente',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150',
  },
  {
    name: 'Letícia Vasconcelos',
    email: 'assessora.gente@scitecjr.com.br',
    role: 'ASSESSOR',
    primaryDept: 'GENTE',
    cargo: 'Assessora de Gente',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
  },
];

async function main() {
  console.log('🏛️  Setting up 9 test members for SciTec jr. hierarchy...');

  // Map old users to their new targets to reassign relationships
  const emailMapping = {
    'gabriel.santos@scitecjr.com.br': 'gerente.negocios@scitecjr.com.br',
    'lucas.mendes@scitecjr.com.br': 'assessor.negocios@scitecjr.com.br',
    'mariana.duarte@scitecjr.com.br': 'assessora.midias@scitecjr.com.br',
    'beatriz.rezende@scitecjr.com.br': 'gerente.admjurfin@scitecjr.com.br',
    'rafael.toledo@scitecjr.com.br': 'gerente.gente@scitecjr.com.br',
  };

  // 1. Create or ensure each target test member exists
  const targetUserMap = {};
  for (const m of testMembers) {
    const user = await prisma.user.upsert({
      where: { email: m.email },
      update: {
        name: m.name,
        role: m.role,
        primaryDept: m.primaryDept,
        cargo: m.cargo,
        avatar: m.avatar,
      },
      create: {
        name: m.name,
        email: m.email,
        role: m.role,
        primaryDept: m.primaryDept,
        cargo: m.cargo,
        avatar: m.avatar,
      },
    });
    targetUserMap[m.email] = user;
    console.log(`✅ Ready: ${user.name} - ${user.cargo} (${user.role}) [${user.email}]`);
  }

  // 2. Reassign cards/requests from old email accounts to new test member accounts
  for (const [oldEmail, newEmail] of Object.entries(emailMapping)) {
    const oldUser = await prisma.user.findUnique({ where: { email: oldEmail } });
    const newUser = targetUserMap[newEmail];

    if (oldUser && newUser && oldUser.id !== newUser.id) {
      await prisma.card.updateMany({
        where: { assigneeId: oldUser.id },
        data: { assigneeId: newUser.id },
      });
      await prisma.prospectLead.updateMany({
        where: { assignedTo: oldUser.id },
        data: { assignedTo: newUser.id },
      });
      await prisma.task.updateMany({
        where: { assigneeId: oldUser.id },
        data: { assigneeId: newUser.id },
      });
      await prisma.crossDeptRequest.updateMany({
        where: { requesterId: oldUser.id },
        data: { requesterId: newUser.id },
      });
      await prisma.crossDeptRequest.updateMany({
        where: { handlerId: oldUser.id },
        data: { handlerId: newUser.id },
      });
      await prisma.cardActivity.updateMany({
        where: { userId: oldUser.id },
        data: { userId: newUser.id },
      });

      await prisma.user.delete({ where: { id: oldUser.id } });
      console.log(`🔄 Merged & cleaned up old user: ${oldEmail} -> ${newEmail}`);
    }
  }

  // 3. Print final roster
  const allUsers = await prisma.user.findMany({
    orderBy: [
      { role: 'asc' },
      { primaryDept: 'asc' },
    ],
  });

  console.log(`\n🎉 SciTec jr. now has exactly ${allUsers.length} members (1 per cargo):`);
  allUsers.forEach((u, i) => {
    console.log(`${i + 1}. [${u.role}] [Setor: ${u.primaryDept}] ${u.name} — ${u.cargo} (${u.email})`);
  });
}

main()
  .catch((e) => {
    console.error('Error during hierarchy seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
