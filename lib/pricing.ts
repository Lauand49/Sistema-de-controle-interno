// Motor de Precificação de Projetos - SciTec jr.

export interface RoleRate {
  cargo: string;
  valorHora: number;
  nucleo: string;
}

export const ROLES_RATES: RoleRate[] = [
  { cargo: 'Desenvolvedor (a) WP', valorHora: 36.0, nucleo: 'Computação' },
  { cargo: 'Designer UX/UI', valorHora: 29.0, nucleo: 'Computação' },
  { cargo: 'Desenvolvedor Back End', valorHora: 42.0, nucleo: 'Computação' },
  { cargo: 'Desenvolvedor (a) Front End', valorHora: 39.0, nucleo: 'Computação' },
  { cargo: 'Desenvolvedor Full Stack', valorHora: 40.5, nucleo: 'Computação' },
  { cargo: 'Desenvolvedor Mobile', valorHora: 41.0, nucleo: 'Computação' },
  { cargo: 'Engenheiro de Dados', valorHora: 45.0, nucleo: 'Computação' },
  { cargo: 'Cientista de Dados', valorHora: 50.0, nucleo: 'Computação' },
  { cargo: 'Analista de Dados', valorHora: 35.0, nucleo: 'Computação' },
  { cargo: 'Conteúdo e SEO', valorHora: 40.0, nucleo: 'Computação' },
  { cargo: 'Design Thinking', valorHora: 35.0, nucleo: 'Computação' },
];

export const CLIENT_SIZE_MODIFIERS = [
  { id: 'PF', label: 'Pessoa física (PF)', descricao: 'Pessoas físicas e cidadãos', modifier: 0.03 },
  { id: 'MEI', label: 'Microempreendedor Individual (MEI)', descricao: 'Pequeno empresário / CNPJ MEI', modifier: 0.05 },
  { id: 'ME', label: 'Microempresa (ME)', descricao: 'Faturamento anual até R$ 360 mil', modifier: 0.07 },
  { id: 'PEQUENA', label: 'Empresa Pequena', descricao: 'R$ 360 mil a R$ 4,8 milhões / ano', modifier: 0.10 },
  { id: 'MEDIA', label: 'Empresa Média', descricao: 'R$ 4,8 milhões a R$ 300 milhões / ano', modifier: 0.15 },
  { id: 'GRANDE', label: 'Empresa Grande', descricao: 'Acima de R$ 300 milhões / ano', modifier: 0.20 },
];

export const URGENCY_MODIFIERS = [
  { id: 'Baixa', label: 'Baixa', modifier: 0.01 },
  { id: 'Média', label: 'Média', modifier: 0.10 },
  { id: 'Alta', label: 'Alta', modifier: 0.25 },
];

export const EXPERIENCE_MODIFIERS = [
  { level: 1, label: '1 - Nenhuma Experiência', modifier: -0.10 },
  { level: 2, label: '2 - Pouca Experiência', modifier: -0.05 },
  { level: 3, label: '3 - Média Experiência', modifier: 0.00 },
  { level: 4, label: '4 - Boa Experiência', modifier: 0.10 },
  { level: 5, label: '5 - Muita Experiência', modifier: 0.20 },
];

export const COMPLEXITY_MODIFIERS = [
  { level: 1, label: '1 - Pouco Complexo', modifier: -0.10 },
  { level: 2, label: '2 - Complexidade Baixa', modifier: -0.05 },
  { level: 3, label: '3 - Complexidade Média', modifier: 0.00 },
  { level: 4, label: '4 - Complexidade Alta', modifier: 0.10 },
  { level: 5, label: '5 - Muito Complexo', modifier: 0.20 },
];

export const BASE_TEAM_SIZE = 4;
export const TEAM_SIZE_FACTOR = 0.05;
export const LOYALTY_DISCOUNT_FACTOR = -0.05;

// Interfaces
export interface ServiceAllocation {
  cargo: string;
  horas: number;
  descricao?: string;
}

export interface ExtraCost {
  descricao: string;
  valor_total: number;
  parcelas?: number;
  categoria?: string;
}

export interface ProjectHeader {
  cliente: string;
  nome_projeto: string;
  porte_cliente: string;
  nivel_experiencia: string | number;
  nivel_complexidade: number;
  urgencia: string;
  num_pessoas: number;
  desconto_fidelidade: boolean;
  desconto_comercial: number; // ex: 0.0 ou 0.10 para 10%
}

export interface SimulationInput {
  projeto: ProjectHeader;
  servicos: ServiceAllocation[];
  custos_extras: ExtraCost[];
}

export interface SimulationResult {
  horas_totais: number;
  preco_parcial_horas: number;
  modificadores: {
    porte: number;
    experiencia: number;
    complexidade: number;
    urgencia: number;
    pessoas: number;
    fidelidade: number;
    desconto_comercial: number;
    modificador_total: number;
  };
  impactos_financeiros: {
    impacto_porte: number;
    impacto_urgencia: number;
    impacto_experiencia: number;
    impacto_complexidade: number;
    impacto_pessoas: number;
    impacto_fidelidade: number;
    impacto_desconto_comercial: number;
    total_acrescimos: number;
  };
  total_custos_extras: number;
  preco_sem_desconto: number;
  preco_final: number;
  detalhes_servicos: Array<{
    cargo: string;
    horas: number;
    valor_hora: number;
    subtotal: number;
    descricao?: string;
  }>;
}

export function lookupPorteModifier(porte: string): number {
  const found = CLIENT_SIZE_MODIFIERS.find(
    (p) =>
      p.label.toLowerCase() === porte.toLowerCase() ||
      p.id.toLowerCase() === porte.toLowerCase() ||
      p.label.toLowerCase().includes(porte.toLowerCase())
  );
  return found ? found.modifier : 0.15; // default Empresa Média
}

export function lookupUrgencyModifier(urgencia: string): number {
  const found = URGENCY_MODIFIERS.find(
    (u) =>
      u.label.toLowerCase() === urgencia.toLowerCase() ||
      u.id.toLowerCase() === urgencia.toLowerCase()
  );
  return found ? found.modifier : 0.10; // default Média
}

export function lookupExperienceModifier(exp: string | number): number {
  if (typeof exp === 'number') {
    const found = EXPERIENCE_MODIFIERS.find((e) => e.level === exp);
    return found ? found.modifier : 0.0;
  }
  const found = EXPERIENCE_MODIFIERS.find(
    (e) =>
      e.label.toLowerCase().includes(exp.toLowerCase()) ||
      exp.toString().startsWith(e.level.toString())
  );
  return found ? found.modifier : 0.0;
}

export function lookupComplexityModifier(comp: number | string): number {
  const num = typeof comp === 'number' ? comp : parseInt(comp.toString().charAt(0), 10);
  const found = COMPLEXITY_MODIFIERS.find((c) => c.level === num);
  return found ? found.modifier : 0.0;
}

export function calculateProjectPricing(input: SimulationInput): SimulationResult {
  const { projeto, servicos, custos_extras } = input;

  // 1. Horas e Custo Parcial de Mão de Obra
  let horas_totais = 0;
  let preco_parcial_horas = 0;

  const detalhes_servicos = servicos.map((item) => {
    const roleInfo = ROLES_RATES.find(
      (r) => r.cargo.toLowerCase() === item.cargo.toLowerCase()
    );
    const valor_hora = roleInfo ? roleInfo.valorHora : 35.0;
    const subtotal = item.horas * valor_hora;

    horas_totais += item.horas;
    preco_parcial_horas += subtotal;

    return {
      cargo: item.cargo,
      horas: item.horas,
      valor_hora,
      subtotal,
      descricao: item.descricao,
    };
  });

  // 2. Modificadores
  const m_porte = lookupPorteModifier(projeto.porte_cliente);
  const m_exp = lookupExperienceModifier(projeto.nivel_experiencia);
  const m_comp = lookupComplexityModifier(projeto.nivel_complexidade);
  const m_urg = lookupUrgencyModifier(projeto.urgencia);
  const m_pess = (projeto.num_pessoas - BASE_TEAM_SIZE) * TEAM_SIZE_FACTOR;
  const m_fid = projeto.desconto_fidelidade ? LOYALTY_DISCOUNT_FACTOR : 0.0;
  const d_comercial = Number(projeto.desconto_comercial || 0);

  // Modificador Total: M_porte + M_exp + M_comp + M_urg + M_pess + M_fid - D_comercial
  // Round to 4 decimal places to prevent float drift
  const rawModTotal = m_porte + m_exp + m_comp + m_urg + m_pess + m_fid - d_comercial;
  const modificador_total = Math.round(rawModTotal * 10000) / 10000;

  // 3. Custos Extras
  const total_custos_extras = custos_extras.reduce(
    (acc, curr) => acc + (Number(curr.valor_total) || 0),
    0
  );

  // 4. Preço Sem Desconto e Preço Final
  // preco_sem_desconto = (preco_parcial_horas * (1 + modificador_total + D_comercial)) + total_custos_extras
  const preco_sem_desconto =
    Math.round(
      (preco_parcial_horas * (1 + modificador_total + d_comercial) + total_custos_extras) * 100
    ) / 100;

  // preco_final = (preco_parcial_horas * (1 + modificador_total)) + total_custos_extras
  const preco_final =
    Math.round((preco_parcial_horas * (1 + modificador_total) + total_custos_extras) * 100) / 100;

  // 5. Impactos Financeiros em R$
  const impacto_porte = Math.round(preco_parcial_horas * m_porte * 100) / 100;
  const impacto_urgencia = Math.round(preco_parcial_horas * m_urg * 100) / 100;
  const impacto_experiencia = Math.round(preco_parcial_horas * m_exp * 100) / 100;
  const impacto_complexidade = Math.round(preco_parcial_horas * m_comp * 100) / 100;
  const impacto_pessoas = Math.round(preco_parcial_horas * m_pess * 100) / 100;
  const impacto_fidelidade = Math.round(preco_parcial_horas * m_fid * 100) / 100;
  const impacto_desconto_comercial =
    Math.round(preco_parcial_horas * -d_comercial * 100) / 100;

  const total_acrescimos =
    Math.round(
      (impacto_porte +
        impacto_urgencia +
        impacto_experiencia +
        impacto_complexidade +
        impacto_pessoas +
        impacto_fidelidade +
        impacto_desconto_comercial) *
        100
    ) / 100;

  return {
    horas_totais: Math.round(horas_totais * 10) / 10,
    preco_parcial_horas: Math.round(preco_parcial_horas * 100) / 100,
    modificadores: {
      porte: m_porte,
      experiencia: m_exp,
      complexidade: m_comp,
      urgencia: m_urg,
      pessoas: m_pess,
      fidelidade: m_fid,
      desconto_comercial: d_comercial,
      modificador_total,
    },
    impactos_financeiros: {
      impacto_porte,
      impacto_urgencia,
      impacto_experiencia,
      impacto_complexidade,
      impacto_pessoas,
      impacto_fidelidade,
      impacto_desconto_comercial,
      total_acrescimos,
    },
    total_custos_extras: Math.round(total_custos_extras * 100) / 100,
    preco_sem_desconto,
    preco_final,
    detalhes_servicos,
  };
}
