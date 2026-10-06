import { useEffect, useState } from "react";
import atom from "../assets/atom (2).png";

export default function AppTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const electronAPI = window.electronAPI;

  useEffect(() => {
    if (!electronAPI?.onWindowState) return undefined;
    return electronAPI.onWindowState(setIsMaximized);
  }, [electronAPI]);

  if (!electronAPI) return null;

  return (
    <header className="app-titlebar flex h-9 shrink-0 items-center border-b text-white">
      <div className="app-titlebar-drag flex min-w-0 flex-1 items-center gap-2 px-3">
        <img src={atom} alt="" className="h-6 w-6 object-contain" />
        <span className="truncate text-xs font-semibold tracking-wide">WG Chamados</span>
        <span className="hidden text-[10px] text-white/65 sm:inline">· Jardim de atendimento</span>
      </div>

      <div className="flex h-full shrink-0 items-stretch">
        <button
          type="button"
          aria-label="Minimizar"
          title="Minimizar"
          onClick={() => electronAPI.minimizeWindow()}
          className="app-titlebar-control flex w-11 items-center justify-center text-white/90 transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-white"
        >
          <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M2 9h8" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={isMaximized ? "Restaurar" : "Maximizar"}
          title={isMaximized ? "Restaurar" : "Maximizar"}
          onClick={() => electronAPI.toggleMaximizeWindow()}
          className="app-titlebar-control flex w-11 items-center justify-center text-white/90 transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-white"
        >
          <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1">
            {isMaximized
              ? <><path d="M4 2h6v6" /><path d="M8 4H2v6h6z" /></>
              : <rect x="2.5" y="2.5" width="7" height="7" />}
          </svg>
        </button>
        <button
          type="button"
          aria-label="Fechar"
          title="Fechar"
          onClick={() => electronAPI.closeWindow()}
          className="app-titlebar-control app-titlebar-close flex w-12 items-center justify-center text-white/90 transition hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-white"
        >
          <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="m3 3 6 6M9 3 3 9" />
          </svg>
        </button>
      </div>
    </header>
  );
}
