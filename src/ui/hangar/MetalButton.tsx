import React from 'react';

interface MetalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: 'primary' | 'secondary';
}

export function MetalButton({ label, variant = 'primary', ...rest }: MetalButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <button
      {...rest}
      className={[
        'relative uppercase tracking-[0.18em] font-black text-sm px-6 py-3',
        'border-[3px] shadow-[0_8px_0_rgba(0,0,0,0.6)]',
        isPrimary
          ? 'bg-[#d91e2c] border-[#5a0f14] text-white'
          : 'bg-[#f0b35c] border-[#5f3c11] text-[#1b0f05]',
        'active:translate-y-[2px] active:shadow-[0_6px_0_rgba(0,0,0,0.6)]',
        'outline-none'
      ].join(' ')}
      style={{ clipPath: 'polygon(6% 0, 100% 0, 100% 80%, 94% 100%, 0 100%, 0 20%)' }}
    >
      <span className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
      <span className="relative z-10">{label}</span>
    </button>
  );
}
