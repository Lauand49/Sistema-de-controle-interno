import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MemberSpec {
  name: string;
  email: string;
  role: string;
  primaryDept: string;
  cargo: string;
  avatar: string;
}

const testMembers: MemberSpec[] = [
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
  console.log('🏛️  Seeding 9 Hierarchy Test Members (1 for each Cargo)...');

  // First, reassign any cards/requests currently belonging to users with old emails
  const existingUsers = await prisma.user.findMany();
  const oldAna = existingUsers.find((u) => u.email === 'ana.clara@scitecjr.com.br');

  // Upsert Gabriel Santos (Gerente de Negócios)
  const gabriel = await prisma.user.upsert({
    where: { email: 'gerente.negocios@scitecjr.com.br' },
    update: {
      name: 'Gabriel Santos',
      role: 'GERENTE',
      primaryDept: 'NEGOCIOS',
      cargo: 'Gerente de Negócios',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    },
    create: {
      name: 'Gabriel Santos',
      email: 'gerente.negocios@scitecjr.com.br',
      role: 'GERENTE',
      primaryDept: 'NEGOCIOS',
      cargo: 'Gerente de Negócios',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    },
  });

  if (oldAna) {
    await prisma.card.updateMany({
      where: { assigneeId: oldAna.id },
      data: { assigneeId: gabriel.id },
    });
    await prisma.crossDeptRequest.updateMany({
      where: { requesterId: oldAna.id },
      data: { requesterId: gabriel.id },
    });
    await prisma.crossDeptRequest.updateMany({
      where: { handlerId: oldAna.id },
      data: { handlerId: gabriel.id },
    });
    await prisma.user.delete({ where: { id: oldAna.id } });
    console.log('Migrated old Ana Clara references to Gabriel Santos');
  }

  // Upsert the 9 test members
  for (const m of testMembers) {
    let oldEmailMatch: string | null = null;
    if (m.name === 'Lucas Mendes') oldEmailMatch = 'lucas.mendes@scitecjr.com.br';
    if (m.name === 'Beatriz Rezende') oldEmailMatch = 'beatriz.rezende@scitecjr.com.br';
    if (m.name === 'Rafael Toledo') oldEmailMatch = 'rafael.toledo@scitecjr.com.br';
    if (m.name === 'Mariana Duarte') oldEmailMatch = 'mariana.duarte@scitecjr.com.br';
    if (m.name === 'Gabriel Santos') oldEmailMatch = 'gabriel.santos@scitecjr.com.br';

    if (oldEmailMatch) {
      const prev = await prisma.user.findUnique({ where: { email: oldEmailMatch } });
      if (prev) {
        await prisma.user.update({
          where: { id: prev.id },
          data: {
            name: m.name,
            email: m.email,
            role: m.role,
            primaryDept: m.primaryDept,
            cargo: m.cargo,
            avatar: m.avatar,
          },
        });
        console.log(`✅ Updated existing user: ${m.name} -> ${m.cargo} (${m.role})`);
        continue;
      }
    }

    const member = await prisma.user.upsert({
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

    console.log(`✅ Upserted: ${member.name} -> ${member.cargo} (${member.role})`);
  }

  const allFinalUsers = await prisma.user.findMany({
    orderBy: [
      { role: 'asc' },
      { primaryDept: 'asc' },
    ],
  });

  console.log(`\n🎉 Total members in SciTec jr.: ${allFinalUsers.length}`);
  allFinalUsers.forEach((u) => {
    console.log(` - [${u.role}] [Setor: ${u.primaryDept}] ${u.name} | Cargo: ${u.cargo} (${u.email})`);
  });
}

main()
  .catch((e) => {
    console.error('Error seeding hierarchy members:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
