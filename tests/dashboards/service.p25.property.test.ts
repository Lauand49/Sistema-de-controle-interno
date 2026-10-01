// Feature: dashboards, Property 25: Forma do Painel_Membro segue o Escopo_Progresso
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { getMemberDashboard } from '@/lib/dashboards/service';
import {
  SECTORS,
  SECTOR_CODES,
  canViewMemberDashboard,
  progressScope,
  type Person,
} from '@/lib/permissions';
import { PERSON_IDS, VALID_UNIT_CODES, arbActivePerson, arbPerson } from './support/arb-person';
import { arbLeadFact, arbNow, arbPeriodo, arbRequestFact, arbTaskFact } from './support/arb-facts';
import {
  createFakeRepo,
  makePerson,
  makeTask,
  type FakeCard,
  type FakePipe,
  type FakeSeed,
} from './support/fake-repo';

// ---------------------------------------------------------------------------
// Geradores locais
// ---------------------------------------------------------------------------

/**
 * Gerente de Setor "puro": sem cargo global e sem cargo de Gerente de Departamento, com ao
 * menos um setor gerido. Contra um alvo de outro id que compartilhe esse setor, o escopo é
 * uma lista de setores.
 */
const arbPureSectorManager: fc.Arbitrary<Person> = arbActivePerson
  .filter((p) => p.sectors.length > 0)
  .map((p) => ({
    ...p,
    globalRole: null,
    departmentRole: p.departmentRole === 'GERENTE' ? ('ASSESSOR' as const) : p.departmentRole,
    sectors: p.sectors.map((s, i) => (i === 0 ? { ...s, role: 'GERENTE' as const } : s)),
  }));

/** Ator e alvo; o segundo ramo força o caso de escopo por setores com frequência. */
const arbActorTarget: fc.Arbitrary<{ actor: Person; target: Person }> = fc.oneof(
  fc.record({ actor: arbActivePerson, target: arbPerson }),
  fc
    .tuple(arbPureSectorManager, arbPerson)
    .map(([actor, t]) => {
      const managed = actor.sectors.find((s) => s.role === 'GERENTE')!;
      const id = PERSON_IDS.find((x) => x !== actor.id)!;
      const sectors = t.sectors.some((s) => s.code === managed.code)
        ? t.sectors
        : [...t.sectors, { code: managed.code, name: managed.name, role: 'MEMBRO' as const }];
      return { actor, target: { ...t, id, sectors } };
    })
);

const arbUnitCodeOrNull = fc.constantFrom<string | null>(null, ...VALID_UNIT_CODES);
const arbAssignee = fc.constantFrom<string | null>(null, ...PERSON_IDS);

/** Até 3 pipes em Unidades válidas, cada um com 1–3 fases. */
const arbPipes: fc.Arbitrary<FakePipe[]> = fc
  .array(fc.tuple(fc.constantFrom(...VALID_UNIT_CODES), fc.integer({ min: 1, max: 3 })), { maxLength: 3 })
  .map((specs) =>
    specs.map(([unitCode, nPhases], i) => ({
      id: `p${i}`,
      name: `Pipe ${i}`,
      unitCode: unitCode as FakePipe['unitCode'],
      createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
      phases: Array.from({ length: nPhases }, (_, j) => ({
        id: `p${i}-f${j}`,
        name: `Fase ${j}`,
        order: j,
        isFinal: j === nPhases - 1,
      })),
    }))
  );

const arbCase = fc
  .tuple(arbNow, arbPeriodo, arbActorTarget, arbPipes)
  .chain(([now, periodo, { actor, target }, pipes]) => {
    const phaseIds = pipes.flatMap((p) => p.phases.map((ph) => ph.id));
    const arbCards: fc.Arbitrary<FakeCard[]> =
      phaseIds.length === 0
        ? fc.constant([])
        : fc
            .array(fc.tuple(fc.constantFrom(...phaseIds), arbAssignee), { maxLength: 12 })
            .map((cs) => cs.map(([phaseId, assigneeId], i) => ({ id: `c${i}`, phaseId, assigneeId })));
    return fc.record({
      now: fc.constant(now),
      periodo: fc.constant(periodo),
      actor: fc.constant(actor),
      target: fc.constant(target),
      pipes: fc.constant(pipes),
      cards: arbCards,
      tasks: fc.array(fc.tuple(arbTaskFact(now, periodo), arbUnitCodeOrNull), { maxLength: 15 }),
      requests: fc.array(arbRequestFact(now, periodo), { maxLength: 10 }),
      leads: fc.array(arbLeadFact(now, periodo), { maxLength: 10 }),
    });
  });

function scopeArgOf(call: { args: unknown[] }, index: number): unknown {
  return call.args[index];
}

// ---------------------------------------------------------------------------
// Propriedade
// ---------------------------------------------------------------------------

describe('Property 25: Forma do Painel_Membro segue o Escopo_Progresso', () => {
  /** **Validates: Requirements 8.2, 8.4, 8.5, 8.6, 8.7** */
  it('escopo, requests e leads do Painel_Membro seguem progressScope', async () => {
    await fc.assert(
      fc.asyncProperty(arbCase, async (c) => {
        fc.pre(canViewMemberDashboard(c.actor, c.target));
        const scope = progressScope(c.actor, c.target)!;

        const target = makePerson({ ...c.target });
        const seed: FakeSeed = {
          people: [target],
          tasks: c.tasks.map(([t, unitCode], i) => makeTask({ ...t, unitCode, id: `t${i}` })),
          pipes: c.pipes,
          cards: c.cards,
          requests: c.requests,
          leads: c.leads,
        };
        const repo = createFakeRepo(seed);

        const dto = await getMemberDashboard(repo, c.actor, target.id, c.periodo, c.now);

        if (scope === 'ALL') {
          expect(dto.scope).toEqual({ kind: 'ALL' });
          expect(dto.requests).not.toBeNull();
          const hasLeads = c.leads.some((l) => l.assignedTo === target.id);
          expect(dto.leads !== null).toBe(hasLeads);
          return;
        }

        // Escopo por setores.
        const codes = new Set<string>(scope);
        expect(codes.size).toBeGreaterThan(0);
        for (const code of codes) expect(SECTOR_CODES as string[]).toContain(code);

        expect(dto.scope).toEqual({
          kind: 'SECTORS',
          sectors: SECTORS.filter((s) => codes.has(s.code)).map((s) => ({ code: s.code, name: s.name })),
        });
        expect(dto.requests).toBeNull();
        expect(dto.leads).toBeNull();

        // Nada de solicitações nem leads é consultado.
        expect(repo.callsOf('handlerRequestCounts')).toEqual([]);
        expect(repo.callsOf('memberLeadRows')).toEqual([]);

        // As consultas de métrica recebem exatamente os códigos do escopo.
        const scoped = [
          ...repo.callsOf('scopedTaskCounts').map((call) => scopeArgOf(call, 1)),
          ...repo.callsOf('overdueTasks').map((call) => (call.args[0] as { scope?: unknown }).scope),
          ...repo.callsOf('memberCardPhases').map((call) => scopeArgOf(call, 1)),
        ];
        expect(scoped).toHaveLength(3);
        for (const arg of scoped) {
          expect(Array.isArray(arg)).toBe(true);
          expect(new Set(arg as string[])).toEqual(codes);
        }
        const allowed = new Set([
          'findPerson',
          'scopedTaskCounts',
          'overdueTasks',
          'memberCardPhases',
        ]);
        for (const call of repo.calls) expect(allowed.has(call.method)).toBe(true);

        // O que volta pertence só aos setores do escopo.
        for (const t of dto.overdueTasks) {
          expect(t.unit).not.toBeNull();
          expect(codes.has(t.unit!.code)).toBe(true);
        }
        for (const g of dto.cards) expect(codes.has(g.pipe.unit.code)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
