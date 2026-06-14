// Cassia 2026-06-14: aviso reutilizável para qualquer view que mostre dados mensais
// (Meta Monthly ROAS, LTV monthly, charts 12M etc) explicando que eventos de
// purchase no pixel estavam duplicados até 18/Fev/2026.
import React from 'react';

interface Props {
  /** texto customizado opcional — default é mensagem padrão */
  message?: string;
  /** estilo compacto (uma linha, sem ícone grande) */
  compact?: boolean;
}

const DEFAULT_MESSAGE =
  'Até 18 de fevereiro de 2026 os eventos de compra (Meta pixel) estavam duplicados. ' +
  'Meses anteriores podem apresentar Purchases / Conversion Value / ROAS inflacionados.';

export default function DuplicatePurchasesDisclaimer({ message, compact }: Props) {
  const text = message ?? DEFAULT_MESSAGE;
  if (compact) {
    return (
      <div
        style={{
          background: '#FEF3C7',
          border: '1px solid #FDE68A',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 11,
          color: '#92400E',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12 }}>⚠️</span>
        <span style={{ lineHeight: 1.4 }}>{text}</span>
      </div>
    );
  }
  return (
    <div
      style={{
        background: '#FEF3C7',
        border: '1px solid #F59E0B',
        borderRadius: 12,
        padding: '12px 16px',
        fontSize: 12.5,
        color: '#92400E',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        marginBottom: 12,
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
      <div style={{ lineHeight: 1.4 }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>Atenção – dados mensais</div>
        {text}
      </div>
    </div>
  );
}
