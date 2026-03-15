// Two people raising their hands together — unity icon for WeWorkTogether
export default function WwtLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 44 38"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="WeWorkTogether logo"
    >
      {/* ── Left person ── */}
      {/* Head */}
      <circle cx="10" cy="7" r="4" fill="currentColor" />
      {/* Body */}
      <line x1="10" y1="11" x2="10" y2="24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      {/* Raised right arm → meeting hands at center */}
      <line x1="10" y1="15" x2="22" y2="8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      {/* Relaxed left arm */}
      <line x1="10" y1="16" x2="4" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Left leg */}
      <line x1="10" y1="24" x2="6.5" y2="33" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      {/* Right leg */}
      <line x1="10" y1="24" x2="13.5" y2="33" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />

      {/* ── Right person ── */}
      {/* Head */}
      <circle cx="34" cy="7" r="4" fill="currentColor" />
      {/* Body */}
      <line x1="34" y1="11" x2="34" y2="24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      {/* Raised left arm → meeting hands at center */}
      <line x1="34" y1="15" x2="22" y2="8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      {/* Relaxed right arm */}
      <line x1="34" y1="16" x2="40" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Left leg */}
      <line x1="34" y1="24" x2="30.5" y2="33" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      {/* Right leg */}
      <line x1="34" y1="24" x2="37.5" y2="33" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />

      {/* ── Clasped hands glow at center top ── */}
      <circle cx="22" cy="8" r="3" fill="currentColor" opacity="0.35" />
      <circle cx="22" cy="8" r="1.8" fill="currentColor" />
    </svg>
  );
}
