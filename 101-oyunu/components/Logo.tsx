type LogoProps = {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Logo({ size = 'md', className = '' }: LogoProps) {
  const cfg = {
    sm: { wrap: 'w-7 h-7 rounded-xl',   text: 'text-[11px]' },
    md: { wrap: 'w-9 h-9 rounded-[14px]', text: 'text-sm'    },
    lg: { wrap: 'w-16 h-16 rounded-3xl', text: 'text-2xl'    },
  }[size]

  return (
    <div className={`${cfg.wrap} bg-ablue flex items-center justify-center flex-shrink-0 shadow-sm ${className}`}>
      <span className={`text-white font-black ${cfg.text} tracking-tight leading-none select-none`}>
        101
      </span>
    </div>
  )
}
