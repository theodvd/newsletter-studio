/**
 * Fond « aurora » global : nuit bleutée + 3 nappes lumineuses animées
 * (CSS only, GPU) + grain léger. Rendu derrière toutes les pages.
 */
export function Aurora() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#0a1322_0%,#04070d_60%)]" />
      <div className="aurora-blob aurora-a" />
      <div className="aurora-blob aurora-b" />
      <div className="aurora-blob aurora-c" />
      <div className="noise" />
    </div>
  );
}
