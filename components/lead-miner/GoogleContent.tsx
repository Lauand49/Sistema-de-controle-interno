import React from 'react';
import { GoogleAttribution } from './GoogleAttribution';

/**
 * Contêiner do Conteudo_Google: distingue visualmente o conteúdo do Google (borda/fundo próprios)
 * e exibe a Atribuicao_Google no mesmo contêiner (Req. 6.4, 17.5).
 */
export const GoogleContent: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`rounded-xl border border-slate-700/70 bg-slate-900/40 p-3 ${className}`}>
    <div className="space-y-1">{children}</div>
    <GoogleAttribution className="mt-2" />
  </div>
);

export default GoogleContent;
