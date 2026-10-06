// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Tabs } from '@/components/ui/Tabs';
import { formatBRL, normalizeDecimalInput, pluralize } from '@/lib/ui/format';

afterEach(cleanup);

describe('Modal', () => {
  it('tem role=dialog, aria-modal, título ligado e botão Fechar rotulado', () => {
    render(<Modal onClose={() => {}} title="Detalhes"><button>ok</button></Modal>);
    const d = screen.getByRole('dialog', { name: 'Detalhes' });
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy();
  });

  it('Esc fecha', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} title="T"><input aria-label="a" /></Modal>);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('foca o primeiro campo, prende o Tab e devolve o foco ao fechar', () => {
    const Host = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>abrir</button>
          <Modal open={open} onClose={() => setOpen(false)} title="T" footer={<button>salvar</button>}>
            <input aria-label="nome" />
          </Modal>
        </>
      );
    };
    render(<Host />);
    const abrir = screen.getByText('abrir');
    abrir.focus();
    fireEvent.click(abrir);
    expect(document.activeElement).toBe(screen.getByLabelText('nome'));
    const salvar = screen.getByText('salvar');
    salvar.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fechar' })); // volta ao primeiro
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });

  it('trava a rolagem da página enquanto aberto', () => {
    const { unmount } = render(<Modal onClose={() => {}} title="T"><p>x</p></Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('Field', () => {
  it('liga o rótulo ao controle, mostra selo, dica e erro acessíveis', () => {
    render(
      <Field label="Nome" required hint="Como no RG" error="Obrigatório preencher">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Nome');
    expect(screen.getByText('Obrigatório')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Obrigatório preencher');
    expect(input.getAttribute('aria-describedby')).toContain('err');
  });

  it('dica aparece quando não há erro e cada campo tem id próprio', () => {
    render(
      <>
        <Field label="A" hint="dica a"><Input /></Field>
        <Field label="B"><Textarea defaultValue="x" /></Field>
      </>,
    );
    expect(screen.getByText('dica a')).toBeTruthy();
    expect(screen.getByLabelText('A').id).not.toBe(screen.getByLabelText('B').id);
  });
});

describe('CurrencyInput', () => {
  const Host = ({ initial = '4' }: { initial?: string }) => {
    const [v, setV] = useState(initial);
    return (
      <>
        <Field label="Valor"><CurrencyInput value={v} onChange={setV} /></Field>
        <output data-testid="stored">{v}</output>
      </>
    );
  };

  it('exibe em pt-BR fora de foco sem alterar o valor gravado', () => {
    render(<Host initial="1234.5" />);
    expect((screen.getByLabelText('Valor') as HTMLInputElement).value).toBe('1.234,50');
    expect(screen.getByTestId('stored').textContent).toBe('1234.5');
  });

  it('aceita vírgula e grava com ponto, como o input numérico gravava', () => {
    render(<Host initial="" />);
    const input = screen.getByLabelText('Valor') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '4,5' } });
    expect(screen.getByTestId('stored').textContent).toBe('4.5');
    fireEvent.blur(input);
    expect(input.value).toBe('4,50');
  });
});

describe('Tabs', () => {
  it('marca a aba ativa e navega com setas', () => {
    const onChange = vi.fn();
    render(<Tabs ariaLabel="Seções" value="a" onChange={onChange} tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} />);
    expect(screen.getByRole('tab', { name: 'A' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('helpers de formatação', () => {
  it('formatBRL só muda a exibição', () => {
    expect(formatBRL('4')).toBe('4,00');
    expect(formatBRL('1234.5')).toBe('1.234,50');
    expect(formatBRL('')).toBe('');
    expect(formatBRL('abc')).toBe('abc');
  });
  it('normalizeDecimalInput devolve o formato gravado', () => {
    expect(normalizeDecimalInput('1.234,56')).toBe('1234.56');
    expect(normalizeDecimalInput('12.5')).toBe('12.5');
    expect(normalizeDecimalInput('4,')).toBe('4.');
    expect(normalizeDecimalInput('a1b')).toBe('1');
  });
  it('pluralize', () => {
    expect(pluralize(1, 'funil', 'funis')).toBe('1 funil');
    expect(pluralize(0, 'pendente', 'pendentes')).toBe('0 pendentes');
  });
});
