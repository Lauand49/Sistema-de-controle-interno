// @vitest-environment jsdom
/**
 * Componentes de apresentação da Etapa 3 (Req. 2.6, 2.7, 4.1, 4.2, 6.4, 17.2):
 * ServiceStatusPanel, SourcePicker, PageSpeedCard e GoogleAttribution.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ServicesStatus } from '@/lib/leads/client-api';
import { ServiceStatusPanel } from '@/components/lead-miner/ServiceStatusPanel';
import { SourcePicker } from '@/components/lead-miner/SourcePicker';
import { PageSpeedCard } from '@/components/lead-miner/ficha/PageSpeedCard';
import { GoogleAttribution } from '@/components/lead-miner/GoogleAttribution';

afterEach(cleanup);

const services = (over: Partial<ServicesStatus> = {}): ServicesStatus => ({
  places: { available: true, motivo: null, usados: 10, limite: 1000 },
  pagespeed: { available: true, motivo: null, usados: 5, limite: 25000, semChave: true },
  gemini: { available: true, motivo: null, usados: 2, limite: 1500 },
  ...over,
});

describe('ServiceStatusPanel', () => {
  it('mostra estado e "N de M chamadas" de cada serviço', () => {
    render(<ServiceStatusPanel services={services()} />);
    expect(screen.getByText('Google Places')).toBeTruthy();
    expect(screen.getByText('10 de 1000 chamadas')).toBeTruthy();
    expect(screen.getByText(/Sem chave: usa a cota reduzida/)).toBeTruthy();
  });

  it('serviço indisponível aparece com o motivo', () => {
    render(<ServiceStatusPanel services={services({ places: { available: false, motivo: 'SEM_CHAVE', usados: 0, limite: 1000 } })} />);
    expect(screen.getByText('chave não configurada')).toBeTruthy();
  });
});

describe('SourcePicker', () => {
  it('desabilita Google e Mista quando o Google está indisponível, com motivo', () => {
    const onChange = vi.fn();
    render(
      <SourcePicker
        value="OSM"
        onChange={onChange}
        services={services({ places: { available: false, motivo: 'COTA_ESGOTADA', usados: 1000, limite: 1000 } })}
      />,
    );
    const google = screen.getByLabelText('Google Places') as HTMLInputElement;
    const osm = screen.getByLabelText('OpenStreetMap') as HTMLInputElement;
    expect(google.disabled).toBe(true);
    expect(osm.disabled).toBe(false);
    expect(screen.getAllByText(/Google Places indisponível: cota mensal esgotada/).length).toBeGreaterThan(0);
  });

  it('seleciona uma fonte disponível', () => {
    const onChange = vi.fn();
    render(<SourcePicker value="MISTA" onChange={onChange} services={services()} />);
    fireEvent.click(screen.getByLabelText('OpenStreetMap'));
    expect(onChange).toHaveBeenCalledWith('OSM');
  });
});

describe('PageSpeedCard', () => {
  it('mostra as notas com faixa e as métricas', () => {
    render(
      <PageSpeedCard
        pagespeed={{
          desempenho: 42,
          acessibilidade: 95,
          boasPraticas: 80,
          seo: 100,
          lcpMs: 3200,
          cls: 0.12,
          tbtMs: 450,
          fcpMs: 1800,
          urlAnalisada: 'https://x.com',
        }}
        motivo={null}
      />,
    );
    expect(screen.getByText('Ruim')).toBeTruthy(); // desempenho 42
    expect(screen.getAllByText('Bom').length).toBeGreaterThan(0); // acessibilidade 95 e seo 100
    expect(screen.getByText('3.20 s')).toBeTruthy(); // LCP
    expect(screen.getByText('0.120')).toBeTruthy(); // CLS
  });

  it('sem resultado mostra o motivo da ausência', () => {
    render(<PageSpeedCard pagespeed={null} motivo="SEM_SITE" />);
    expect(screen.getByText(/Empresa sem site informado/)).toBeTruthy();
  });
});

describe('GoogleAttribution', () => {
  it('exibe "Google Maps" com translate="no"', () => {
    render(<GoogleAttribution />);
    const el = screen.getByText('Google Maps');
    expect(el.getAttribute('translate')).toBe('no');
  });
});
