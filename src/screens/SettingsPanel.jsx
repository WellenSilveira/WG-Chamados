import { useEffect, useState } from "react";
import { loadLocalDatabase } from "../lib/db.js";

const tabs = ["Geral", "Chamados", "Usuários", "Dados", "Segurança"];
const fieldClass = "rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-700";
const permissionActions = [
  ["createTicket", "Abrir chamados"],
  ["viewOwnTickets", "Ver próprios chamados"],
  ["viewOpenTickets", "Ver fila de chamados"],
  ["replyTickets", "Responder chamados"],
  ["closeTickets", "Fechar chamados"],
  ["manageUsers", "Gerenciar usuários"],
  ["manageAssets", "Gerenciar inventário"],
  ["manageSettings", "Alterar configurações"],
];
const profiles = ["Usuário Comum", "Resolutor", "Administrador"];

export default function SettingsPanel({ settings, onSaveSettings }) {
  const [tab, setTab] = useState("Geral");
  const [saved, setSaved] = useState("");
  const [databasePath, setDatabasePath] = useState("Banco local do aplicativo");
  const [newCategory, setNewCategory] = useState("");
  const [newDepartment, setNewDepartment] = useState("");

  useEffect(() => {
    window.electronAPI?.getDatabasePath?.()
      .then((filePath) => { if (filePath) setDatabasePath(filePath); })
      .catch(() => {});
  }, []);

  async function save(nextSettings, description) {
    try {
      await onSaveSettings(nextSettings, description);
      setSaved("Salvo");
      window.setTimeout(() => setSaved(""), 2500);
    } catch (error) {
      console.error("Falha ao salvar configuração:", error);
      setSaved("Falha ao salvar");
    }
  }

  function update(patch, description) {
    return save({ ...settings, ...patch }, description);
  }

  function updateBackup(patch, description) {
    return update({ backup: { ...settings.backup, ...patch } }, description);
  }

  function updateSecurity(patch, description) {
    return update({ security: { ...settings.security, ...patch } }, description);
  }

  async function addCategory(event) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name || settings.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) return;
    await update({ categories: [...settings.categories, { id: `category-${Date.now()}`, name, active: true }] }, `Adicionou categoria: ${name}`);
    setNewCategory("");
  }

  async function addDepartment(event) {
    event.preventDefault();
    const name = newDepartment.trim().replace(/\s+/g, " ");
    if (!name || settings.departments.some((department) => department.toLowerCase() === name.toLowerCase())) return;
    await update({ departments: [...settings.departments, name] }, `Adicionou setor: ${name}`);
    setNewDepartment("");
  }

  async function savePriority(name, property, rawValue) {
    const value = Math.max(1, Number(rawValue) || 1);
    const priorities = settings.priorities.map((priority) => priority.name === name ? { ...priority, [property]: value } : priority);
    await update({ priorities }, `Alterou SLA de ${property === "responseHours" ? "resposta" : "resolução"} para ${name}`);
  }

  async function savePermission(profile, action, checked) {
    const existing = (settings.permissions[profile] ?? []).filter((permission) => permission !== "all");
    const permissions = {
      ...settings.permissions,
      [profile]: checked ? [...new Set([...existing, action])] : existing.filter((permission) => permission !== action),
    };
    await update({ permissions }, `Alterou permissão ${action} do perfil ${profile}`);
  }

  async function selectBackupFolder() {
    const folder = await window.electronAPI?.selectBackupFolder?.();
    if (folder) await updateBackup({ folder }, "Alterou a pasta de backup");
  }

  async function createBackup() {
    const result = await window.electronAPI?.createBackup?.();
    if (!result) return;
    await updateBackup({ lastBackupAt: result.createdAt }, "Criou backup local");
    setSaved(`Backup salvo em ${result.filePath}`);
  }

  async function restoreBackup() {
    const restored = await window.electronAPI?.restoreBackup?.();
    if (restored) {
      await onSaveSettings(restored.settings, "Restaurou um backup local");
      window.location.reload();
    }
  }

  async function exportDatabase() {
    const database = await loadLocalDatabase();
    const blob = new Blob([JSON.stringify(database, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `wg-chamados-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    await save(settings, "Exportou os dados locais");
  }

  return (
    <section className="overflow-hidden border border-slate-300 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-300 px-4 py-3">
        <div>
          <h1 className="text-base font-bold">Configurações</h1>
          <p className="mt-1 text-[10.8px] uppercase tracking-wider text-slate-500">Regras gerais do sistema</p>
        </div>
        {saved && <span role="status" className="max-w-72 truncate text-[12px] font-semibold text-emerald-700">{saved}</span>}
      </header>
      <nav className="flex overflow-x-auto border-b border-slate-300 bg-slate-100 px-2" aria-label="Seções de configurações">
        {tabs.map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 border-b-2 px-4 py-3 text-xs font-semibold ${tab === item ? "border-sky-800 text-sky-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {item}
          </button>
        ))}
      </nav>

      {tab === "Geral" && (
        <div className="space-y-6 p-4 sm:p-6">
          <label className="flex max-w-xl flex-col gap-1 text-[12px] text-slate-600">
            Nome do sistema
            <input aria-label="Nome do sistema" defaultValue={settings.appName} onBlur={(event) => update({ appName: event.target.value.trim() || "WG Chamados" }, "Alterou o nome do sistema")} className={fieldClass} />
          </label>
          <div className="flex max-w-3xl flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xs font-semibold">Modo offline</h2>
              <p className="mt-1 text-[12px] text-slate-500">Os dados são armazenados no dispositivo. A sincronização remota não está configurada.</p>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={settings.offlineMode} onChange={(event) => update({ offlineMode: event.target.checked }, `Modo offline ${event.target.checked ? "ativado" : "desativado"}`)} className="h-4 w-4 accent-sky-800" />
              {settings.offlineMode ? "Ativo" : "Desativado"}
            </label>
          </div>
          <div className="flex max-w-3xl flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xs font-semibold">Banco local</h2>
              <p className="mt-1 break-all font-mono text-[12px] text-slate-500">{databasePath}</p>
              <p className="mt-1 text-[12px] text-slate-500">Os dados ficam salvos neste dispositivo. A conexão com banco em nuvem ainda não foi configurada.</p>
            </div>
          </div>
          <p className="max-w-3xl border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-sky-900">Novos cadastros ficam em Notificações para aprovação manual do administrador.</p>
        </div>
      )}

      {tab === "Chamados" && (
        <div className="space-y-7 p-4 sm:p-6">
          <section>
            <h2 className="text-xs font-semibold">Categorias de chamado</h2>
            <p className="mt-1 text-[12px] text-slate-500">Desative categorias para preservar o histórico.</p>
            <div className="mt-3 max-w-3xl divide-y divide-slate-200 border-y border-slate-200">
              {settings.categories.map((category) => (
                <div key={category.id} className="flex flex-wrap items-center gap-3 py-2">
                  <input aria-label={`Nome da categoria ${category.name}`} defaultValue={category.name} onBlur={async (event) => {
                    const name = event.target.value.trim();
                    if (!name || name === category.name) return;
                    const categories = settings.categories.map((item) => item.id === category.id ? { ...item, name } : item);
                    await update({ categories }, `Renomeou categoria ${category.name} para ${name}`);
                  }} className={`${fieldClass} min-w-48 flex-1`} />
                  <span className={`text-[10.8px] font-semibold uppercase ${category.active ? "text-emerald-700" : "text-slate-500"}`}>{category.active ? "Ativa" : "Inativa"}</span>
                  <button type="button" onClick={() => {
                    const categories = settings.categories.map((item) => item.id === category.id ? { ...item, active: !item.active } : item);
                    update({ categories }, `${category.active ? "Desativou" : "Ativou"} categoria ${category.name}`);
                  }} className="rounded border border-slate-300 px-3 py-2 text-[12px] hover:bg-slate-100">{category.active ? "Desativar" : "Ativar"}</button>
                </div>
              ))}
            </div>
            <form onSubmit={addCategory} className="mt-3 flex max-w-3xl flex-wrap gap-2">
              <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Nova categoria" className={`${fieldClass} min-w-48 flex-1`} />
              <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100">Adicionar</button>
            </form>
          </section>

          <section>
            <h2 className="text-xs font-semibold">Prioridades e SLA</h2>
            <div className="mt-3 max-w-3xl overflow-x-auto border border-slate-200">
              <table className="w-full min-w-120 text-left text-xs">
                <thead className="bg-slate-100 text-[10.8px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">Prioridade</th><th className="px-3 py-2">Resposta (h)</th><th className="px-3 py-2">Resolução (h)</th></tr></thead>
                <tbody>{settings.priorities.map((priority) => <tr key={priority.name} className="border-t border-slate-200"><td className="px-3 py-2 font-semibold">{priority.name}</td>{[["responseHours", priority.responseHours], ["resolutionHours", priority.resolutionHours]].map(([property, value]) => <td key={property} className="px-3 py-2"><input type="number" min="1" defaultValue={value} onBlur={(event) => {
                  const number = Math.max(1, Number(event.target.value) || 1);
                  if (number === value) return;
                  const priorities = settings.priorities.map((item) => item.name === priority.name ? { ...item, [property]: number } : item);
                  update({ priorities }, `Alterou SLA de ${property === "responseHours" ? "resposta" : "resolução"} para ${priority.name}`);
                }} className={`${fieldClass} w-24`} /></td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="grid max-w-3xl gap-5 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12px] text-slate-600">Fluxo de status (separados por vírgula)<input defaultValue={settings.statusFlow.join(", ")} onBlur={(event) => {
              const statusFlow = event.target.value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
              if (statusFlow.length) update({ statusFlow }, "Alterou o fluxo de status");
            }} className={fieldClass} /></label>
            <div className="flex flex-col gap-1 text-[12px] text-slate-600">
              Atribuição de chamados
              <p className={`${fieldClass} text-slate-500`}>Manual pelo administrador, com seleção do resolutor e prioridade na lista de chamados.</p>
            </div>
          </section>
        </div>
      )}

      {tab === "Usuários" && (
        <div className="space-y-7 p-4 sm:p-6">
          <section>
            <h2 className="text-xs font-semibold">Setores cadastrados</h2>
            <div className="mt-3 flex max-w-3xl flex-wrap gap-2">
              {settings.departments.map((department) => <span key={department} className="inline-flex items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs">{department}<button type="button" disabled={settings.departments.length <= 1} aria-label={`Remover setor ${department}`} onClick={() => update({ departments: settings.departments.filter((item) => item !== department) }, `Removeu setor ${department}`)} className="text-slate-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-30">×</button></span>)}
            </div>
            <form onSubmit={addDepartment} className="mt-3 flex max-w-xl flex-wrap gap-2">
              <input value={newDepartment} onChange={(event) => setNewDepartment(event.target.value)} placeholder="Adicionar setor" className={`${fieldClass} min-w-48 flex-1`} />
              <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100">Adicionar</button>
            </form>
          </section>
          <section>
            <h2 className="text-xs font-semibold">Permissões por perfil</h2>
            <div className="mt-3 max-w-4xl overflow-x-auto border border-slate-200">
              <table className="w-full min-w-160 text-left text-[12px]">
                <thead className="bg-slate-100 uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">Ação</th>{profiles.map((profile) => <th key={profile} className="px-3 py-2">{profile}</th>)}</tr></thead>
                <tbody>{permissionActions.map(([action, label]) => <tr key={action} className="border-t border-slate-200"><td className="px-3 py-2">{label}</td>{profiles.map((profile) => <td key={profile} className="px-3 py-2"><input type="checkbox" aria-label={`${label}: ${profile}`} checked={(settings.permissions[profile] ?? []).includes("all") || (settings.permissions[profile] ?? []).includes(action)} onChange={(event) => {
                  const existing = (settings.permissions[profile] ?? []).filter((permission) => permission !== "all");
                  const permissions = { ...settings.permissions, [profile]: event.target.checked ? [...new Set([...existing, action])] : existing.filter((permission) => permission !== action) };
                  update({ permissions }, `Alterou permissão ${action} do perfil ${profile}`);
                }} className="h-4 w-4 accent-sky-800" /></td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "Dados" && (
        <div className="space-y-6 p-4 sm:p-6">
          <section className="max-w-3xl">
            <h2 className="text-xs font-semibold">Backup automático</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[12px] text-slate-600">Frequência<select value={settings.backup.frequency} onChange={(event) => updateBackup({ frequency: event.target.value }, "Alterou frequência do backup")} className={fieldClass}><option value="disabled">Desativado</option><option value="daily">Diário</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option></select></label>
              <div className="flex flex-col gap-1 text-[12px] text-slate-600">Pasta de destino<div className="flex gap-2"><input readOnly value={settings.backup.folder || "Pasta padrão do aplicativo"} className={`${fieldClass} min-w-0 flex-1`} /><button type="button" onClick={async () => {
                const folder = await window.electronAPI?.selectBackupFolder?.();
                if (folder) await updateBackup({ folder }, "Alterou pasta de backup");
              }} className="rounded border border-slate-300 px-3 text-[12px] hover:bg-slate-100">Escolher</button></div></div>
            </div>
            <p className="mt-2 text-[12px] text-slate-500">Último backup: {settings.backup.lastBackupAt ? new Date(settings.backup.lastBackupAt).toLocaleString() : "Ainda não criado"}</p>
          </section>
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-5">
            <button type="button" onClick={async () => {
              const result = await window.electronAPI?.createBackup?.();
              if (!result) return;
              await updateBackup({ lastBackupAt: result.createdAt }, "Criou backup local");
              setSaved(`Backup salvo em ${result.filePath}`);
            }} className="rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800">Fazer backup agora</button>
            <button type="button" onClick={async () => {
              const restored = await window.electronAPI?.restoreBackup?.();
              if (restored) window.location.reload();
            }} className="rounded border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100">Restaurar backup</button>
            <button type="button" onClick={async () => {
              const database = await loadLocalDatabase();
              const blob = new Blob([JSON.stringify(database, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `wg-chamados-export-${new Date().toISOString().slice(0, 10)}.json`;
              anchor.click();
              URL.revokeObjectURL(url);
              await save(settings, "Exportou dados locais");
            }} className="rounded border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100">Exportar dados</button>
          </div>
        </div>
      )}

      {tab === "Segurança" && (
        <div className="space-y-6 p-4 sm:p-6">
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <NumberSetting label="Tamanho mínimo da senha" value={settings.security.minimumPasswordLength} min={6} onSave={(value) => updateSecurity({ minimumPasswordLength: value }, "Alterou tamanho mínimo da senha")} />
            <NumberSetting label="Tempo de sessão (minutos)" value={settings.security.sessionTimeoutMinutes} min={5} onSave={(value) => updateSecurity({ sessionTimeoutMinutes: value }, "Alterou tempo de sessão")} />
            <NumberSetting label="Tentativas antes do bloqueio" value={settings.security.maxLoginAttempts} min={1} onSave={(value) => updateSecurity({ maxLoginAttempts: value }, "Alterou limite de tentativas de login")} />
            <NumberSetting label="Retenção de auditoria (dias)" value={settings.auditRetentionDays} min={1} onSave={(value) => update({ auditRetentionDays: value }, "Alterou retenção de auditoria")} />
          </div>
          <label className="flex max-w-3xl items-center gap-3 border-t border-slate-200 pt-4 text-xs">
            <input type="checkbox" checked={settings.security.requirePasswordChange} onChange={(event) => updateSecurity({ requirePasswordChange: event.target.checked }, "Alterou troca obrigatória de senha")} className="h-4 w-4 accent-sky-800" />
            Exigir troca de senha no primeiro acesso
          </label>
        </div>
      )}
    </section>
  );
}

function NumberSetting({ label, value, min, onSave }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-slate-600">
      {label}
      <input type="number" min={min} defaultValue={value} onBlur={(event) => {
        const nextValue = Math.max(min, Number(event.target.value) || min);
        if (nextValue !== value) onSave(nextValue);
      }} className={`${fieldClass} w-full`} />
    </label>
  );
}

export function AuditPanel({ auditLogs = [] }) {
  const [query, setQuery] = useState("");
  const filteredLogs = auditLogs.filter((entry) =>
    `${entry.description} ${entry.actorName} ${entry.action}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <section className="overflow-hidden border border-slate-300 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 px-4 py-3">
        <div>
          <h1 className="text-base font-bold">Auditoria</h1>
          <p className="mt-1 text-[10.8px] uppercase tracking-wider text-slate-500">Registro de alterações administrativas</p>
        </div>
        <input type="search" aria-label="Buscar na auditoria" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar evento ou usuário..." className={`${fieldClass} w-56`} />
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-160 text-left text-[12px]">
          <thead className="bg-slate-100 text-[9.6px] uppercase tracking-widest text-slate-500">
            <tr><th className="px-4 py-3 font-medium">Data e hora</th><th className="px-4 py-3 font-medium">Usuário</th><th className="px-4 py-3 font-medium">Evento</th><th className="px-4 py-3 font-medium">Ação</th></tr>
          </thead>
          <tbody>
            {filteredLogs.slice(0, 500).map((entry) => (
              <tr key={entry.id} className="border-t border-slate-200 text-slate-700">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-[10.8px] text-slate-500">{new Date(entry.createdAt).toLocaleString()}</td>
                <td className="whitespace-nowrap px-4 py-3">{entry.actorName}</td>
                <td className="px-4 py-3">{entry.description}</td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-[10.8px] text-slate-500">{entry.action}</td>
              </tr>
            ))}
            {filteredLogs.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-xs text-slate-500">Nenhum evento encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-slate-200 px-4 py-2 font-mono text-[9.6px] uppercase tracking-widest text-slate-500">
        {filteredLogs.length} eventos
      </footer>
    </section>
  );
}