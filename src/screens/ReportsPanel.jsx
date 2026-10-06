import { useEffect, useState } from "react";

const STORAGE_KEY = "pixie-reports-filters";
const CLOSED = ["RESOLVIDO", "SOLUCIONADO", "FECHADO"];
const SECTIONS = ["Visão geral", "SLA", "Inventário", "Usuários"];
const FIELD = "h-9 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800";

function defaults() {
  return {
    period: "30d", start: "", end: "", department: "Todos os setores",
    category: "Todas as categorias", priority: "Todas as prioridades",
    resolver: "Todos os resolutores", section: "Visão geral", sort: "date",
    direction: "desc", stalledDays: 7,
  };
}

function loadFilters() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") }; }
  catch { return defaults(); }
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(typeof value === "string" && value.includes(" ") && !value.includes("T") ? value.replace(" ", "T") : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolutionDeadline(ticket, priorities) {
  const storedDeadline = parseDate(ticket.resolutionDueAt);
  if (storedDeadline) return storedDeadline;
  const opened = parseDate(ticket.date);
  const priority = priorities.find((item) => item.name.toUpperCase() === ticket.priority?.toUpperCase());
  return opened && priority ? new Date(opened.getTime() + priority.resolutionHours * 3600000) : null;
}

function isWithinResolutionSla(ticket, priorities) {
  const closed = parseDate(ticket.updatedAt ?? ticket.closedAt);
  const deadline = resolutionDeadline(ticket, priorities);
  return Boolean(closed && deadline && closed <= deadline);
}

function Metric({ label, value, note, tone = "text-slate-800" }) {
  return <article className="border border-slate-300 bg-white p-3"><p className="text-[11.7px] font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className={`my-2 text-2xl font-bold ${tone}`}>{value}</p><p className="text-[11.7px] text-slate-500">{note}</p></article>;
}

function Filter({ label, value, options, onChange }) {
  return <label className="flex flex-col gap-1 text-[11.7px] text-slate-500">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className={FIELD}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function TicketsTable({ tickets, sort, direction, onSort }) {
  const columns = [["id", "ID"], ["title", "Título"], ["category", "Categoria"], ["department", "Setor"], ["priority", "Prioridade"], ["status", "Status"], ["responsible", "Resolutor"]];
  const rows = [...tickets].sort((a, b) => {
    const result = String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), undefined, { numeric: true, sensitivity: "base" });
    return direction === "asc" ? result : -result;
  });
  return <div className="overflow-x-auto border border-slate-200"><table className="w-full min-w-180 border-collapse text-left text-[13px]"><thead className="bg-slate-100 text-[10.4px] uppercase tracking-widest text-slate-500"><tr>{columns.map(([key, title]) => <th key={key} className="px-3 py-2"><button type="button" onClick={() => onSort(key)} className="font-medium hover:text-sky-800">{title}{sort === key ? direction === "asc" ? " ↑" : " ↓" : ""}</button></th>)}</tr></thead><tbody>{rows.map((ticket) => <tr key={ticket.id} className="border-t border-slate-200 text-slate-700 hover:bg-slate-50"><td className="whitespace-nowrap px-3 py-2 font-mono text-[11.7px] text-sky-800">{ticket.id}</td><td className="max-w-64 truncate px-3 py-2">{ticket.title}</td><td className="px-3 py-2">{ticket.category}</td><td className="px-3 py-2">{ticket.department ?? "-"}</td><td className="px-3 py-2">{ticket.priority}</td><td className="px-3 py-2">{ticket.status}</td><td className="px-3 py-2">{ticket.responsible ?? "Não atribuído"}</td></tr>)}{rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-slate-500">Nenhum chamado neste recorte.</td></tr>}</tbody></table></div>;
}

function TicketList({ tickets, onSelect }) {
  return <div className="mt-3 divide-y divide-slate-200">{tickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => onSelect([ticket])} className="flex w-full justify-between gap-3 py-2 text-left text-[13px] hover:bg-slate-50"><span><strong>{ticket.id}</strong> · {ticket.title}</span><span className="shrink-0 text-slate-500">{ticket.sla}</span></button>)}{tickets.length === 0 && <p className="py-3 text-xs text-slate-500">Nenhum chamado neste recorte.</p>}</div>;
}

export default function ReportsPanel({ tickets = [], users = [], assets = [], settings = {} }) {
  const [filters, setFilters] = useState(loadFilters);
  const [selectedRows, setSelectedRows] = useState(null);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); }, [filters]);
  const setFilter = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setSelectedRows(null); };
  const change = setFilter;

  const now = new Date();
  let start = new Date(now);
  let end = new Date(now);
  if (filters.period === "today") start.setHours(0, 0, 0, 0);
  if (filters.period === "7d") start.setDate(now.getDate() - 6);
  if (filters.period === "30d") start.setDate(now.getDate() - 29);
  if (filters.period === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
  if (filters.period === "custom") {
    start = filters.start ? new Date(`${filters.start}T00:00:00`) : new Date(0);
    end = filters.end ? new Date(`${filters.end}T23:59:59`) : now;
  }

  const departments = [...new Set([...(settings.departments ?? []), ...tickets.map((ticket) => ticket.department).filter(Boolean)])].sort();
  const categories = [...new Set([...(settings.categories ?? []).map((category) => category.name.toUpperCase()), ...tickets.map((ticket) => ticket.category?.toUpperCase()).filter(Boolean)])].sort();
  const resolvers = [...new Set(tickets.map((ticket) => ticket.responsible).filter((name) => name && name !== "Não atribuído"))].sort();
  const filtered = tickets.filter((ticket) => {
    const openedAt = parseDate(ticket.date);
    const closedAt = parseDate(ticket.updatedAt ?? ticket.closedAt);
    const matchesPeriod = (openedAt && openedAt >= start && openedAt <= end) || (CLOSED.includes(ticket.status) && closedAt && closedAt >= start && closedAt <= end);
    return matchesPeriod && (filters.department === "Todos os setores" || ticket.department === filters.department) && (filters.category === "Todas as categorias" || ticket.category?.toUpperCase() === filters.category) && (filters.priority === "Todas as prioridades" || ticket.priority === filters.priority) && (filters.resolver === "Todos os resolutores" || ticket.responsible === filters.resolver);
  });
  const opened = filtered.filter((ticket) => { const date = parseDate(ticket.date); return date && date >= start && date <= end; });
  const closed = filtered.filter((ticket) => CLOSED.includes(ticket.status));
  const closedWithDates = closed.map((ticket) => ({ ticket, opened: parseDate(ticket.date), closed: parseDate(ticket.updatedAt ?? ticket.closedAt) })).filter((item) => item.opened && item.closed && item.closed >= item.opened);
  const averageHours = closedWithDates.length ? closedWithDates.reduce((sum, item) => sum + (item.closed - item.opened) / 3600000, 0) / closedWithDates.length : null;
  const withinSla = closed.filter((ticket) => isWithinResolutionSla(ticket, settings.priorities ?? [])).length;
  const slaPercent = closed.length ? Math.round(withinSla / closed.length * 100) : 0;
  const overdue = filtered.filter((ticket) => !CLOSED.includes(ticket.status) && (resolutionDeadline(ticket, settings.priorities ?? []) < now || /VENCEU|ATRASADO/i.test(ticket.sla ?? "")));
  const almostDue = filtered.filter((ticket) => { if (CLOSED.includes(ticket.status) || overdue.some((item) => item.id === ticket.id)) return false; const deadline = resolutionDeadline(ticket, settings.priorities ?? []); if (deadline) return deadline >= now && deadline - now <= 2 * 3600000; const hours = Number((ticket.sla ?? "").match(/(\d+)H/i)?.[1]); return Number.isFinite(hours) && hours <= 2; });
  const stalled = filtered.filter((ticket) => { if (CLOSED.includes(ticket.status)) return false; const last = parseDate(ticket.updatedAt ?? ticket.date); return last && now - last >= filters.stalledDays * 86400000; });
  const reopened = filtered.filter((ticket) => Number(ticket.reopenCount ?? 0) > 0);
  const categoryCounts = categories.map((category) => ({ category, count: filtered.filter((ticket) => ticket.category?.toUpperCase() === category).length })).sort((a, b) => b.count - a.count);
  const sectorCounts = departments.map((department) => ({ department, count: filtered.filter((ticket) => ticket.department === department).length })).sort((a, b) => b.count - a.count);
  const resolverStats = resolvers.map((resolver) => {
    const assigned = filtered.filter((ticket) => ticket.responsible === resolver);
    const solved = assigned.filter((ticket) => CLOSED.includes(ticket.status));
    const timed = closedWithDates.filter((item) => item.ticket.responsible === resolver);
    const average = timed.length ? timed.reduce((sum, item) => sum + (item.closed - item.opened) / 3600000, 0) / timed.length : null;
    return { resolver, assigned: assigned.length, average, sla: solved.length ? Math.round(solved.filter((ticket) => isWithinResolutionSla(ticket, settings.priorities ?? [])).length / solved.length * 100) : 0 };
  });

  const days = filters.period === "today" ? 1 : filters.period === "7d" ? 7 : Math.min(30, Math.max(1, Math.ceil((end - start) / 86400000) + 1));
  const trend = Array.from({ length: days }, (_, index) => {
    const date = new Date(end); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - days + 1 + index);
    const next = new Date(date); next.setDate(next.getDate() + 1);
    return { date, next, label: date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" }), opened: filtered.filter((ticket) => { const value = parseDate(ticket.date); return value && value >= date && value < next; }).length, resolved: filtered.filter((ticket) => { const value = parseDate(ticket.updatedAt ?? ticket.closedAt); return CLOSED.includes(ticket.status) && value && value >= date && value < next; }).length };
  });
  const maxTrend = Math.max(1, ...trend.flatMap((item) => [item.opened, item.resolved]));
  const chartHeight = 180;
  const point = (value, index) => ({ x: trend.length < 2 ? 360 : 18 + index * (684 / (trend.length - 1)), y: chartHeight - 25 - value / maxTrend * 135 });
  const linePath = (key) => trend.map((item, index) => { const value = point(item[key], index); return `${index ? "L" : "M"}${value.x},${value.y}`; }).join(" ");
  const rows = [...(selectedRows ?? filtered)];
  const ordered = rows;

  function selectTrendDay(day, kind) {
    setSelectedRows(filtered.filter((ticket) => { const date = parseDate(kind === "opened" ? ticket.date : ticket.updatedAt ?? ticket.closedAt); return date && date >= day.date && date < day.next && (kind === "opened" || CLOSED.includes(ticket.status)); }));
  }
  const selectDay = selectTrendDay;
  function sortColumn(column) { setFilters((current) => ({ ...current, sort: column, direction: current.sort === column && current.direction === "asc" ? "desc" : "asc" })); }
  function exportCsv() {
    const headers = ["ID", "Título", "Categoria", "Setor", "Prioridade", "Status", "Resolutor", "Abertura"];
    const csv = [headers, ...rows.map((ticket) => [ticket.id, ticket.title, ticket.category, ticket.department, ticket.priority, ticket.status, ticket.responsible, ticket.date])].map((record) => record.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `relatorio-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  return (
    <section id="reports-content" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border border-slate-300 bg-white p-4"><div><h1 className="text-base font-bold">Relatórios</h1><p className="mt-1 text-[10.8px] uppercase tracking-wider text-slate-500">Dados locais · última sincronização: {settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString() : "Ainda não registrada"}</p></div><div className="reports-no-print flex gap-2"><button type="button" onClick={exportCsv} className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100">Exportar CSV</button><button type="button" onClick={() => window.print()} className="rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800">Imprimir PDF</button></div></header>
      <div className="reports-no-print flex flex-wrap items-end gap-2 border border-slate-300 bg-white p-3">
        <label className="flex flex-col gap-1 text-[10.8px] text-slate-500">Período<select value={filters.period} onChange={(event) => change("period", event.target.value)} className={FIELD}><option value="today">Hoje</option><option value="7d">7 dias</option><option value="30d">30 dias</option><option value="month">Mês atual</option><option value="custom">Personalizado</option></select></label>
        {filters.period === "custom" && <><label className="flex flex-col gap-1 text-[10.8px] text-slate-500">De<input type="date" value={filters.start} onChange={(event) => change("start", event.target.value)} className={FIELD} /></label><label className="flex flex-col gap-1 text-[10.8px] text-slate-500">Até<input type="date" value={filters.end} onChange={(event) => change("end", event.target.value)} className={FIELD} /></label></>}
        <SelectFilter label="Setor" value={filters.department} options={["Todos os setores", ...departments]} onChange={(value) => change("department", value)} /><SelectFilter label="Categoria" value={filters.category} options={["Todas as categorias", ...categories]} onChange={(value) => change("category", value)} /><SelectFilter label="Prioridade" value={filters.priority} options={["Todas as prioridades", ...new Set(tickets.map((ticket) => ticket.priority).filter(Boolean))]} onChange={(value) => change("priority", value)} /><SelectFilter label="Resolutor" value={filters.resolver} options={["Todos os resolutores", ...resolvers]} onChange={(value) => change("resolver", value)} />
      </div>
      <nav className="reports-no-print flex overflow-x-auto border border-slate-300 bg-slate-100 px-2" aria-label="Relatórios por tema">{SECTIONS.map((section) => <button key={section} type="button" onClick={() => change("section", section)} className={`shrink-0 border-b-2 px-4 py-3 text-xs font-semibold ${filters.section === section ? "border-sky-800 text-sky-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{section}</button>)}</nav>

      {filters.section === "Visão geral" && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Abertos no período" value={opened.length} note={`${filtered.filter((ticket) => !CLOSED.includes(ticket.status)).length} ainda na fila`} /><Metric label="Resolvidos" value={closed.length} note="No recorte selecionado" tone="text-emerald-700" /><Metric label="Tempo médio de resolução" value={averageHours === null ? "—" : `${averageHours.toFixed(1)} h`} note={closedWithDates.length ? `${closedWithDates.length} com datas válidas` : "Sem resoluções com datas"} /><Metric label="Dentro do SLA" value={`${slaPercent}%`} note={`${withinSla} de ${closed.length} resolvidos`} tone={slaPercent >= 80 ? "text-emerald-700" : "text-amber-700"} /></div>
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="border border-slate-300 bg-white p-4"><h2 className="text-xs font-semibold">Volume de chamados</h2><div className="mt-2 flex gap-4 text-[10.8px]"><span className="text-sky-800">● Abertos</span><span className="text-emerald-700">● Resolvidos</span></div><div className="mt-2 overflow-x-auto"><svg viewBox={`0 0 720 ${chartHeight}`} role="img" aria-label="Volume diário de chamados abertos e resolvidos" className="h-52 min-w-160 w-full">{[0, 1, 2, 3].map((line) => <line key={line} x1="18" x2="702" y1={15 + line * 45} y2={15 + line * 45} stroke="#e2e8f0" />)}<path d={linePath("opened")} fill="none" stroke="#0369a1" strokeWidth="3" /><path d={linePath("resolved")} fill="none" stroke="#059669" strokeWidth="3" />{trend.map((day, index) => { const a = point(day.opened, index); const r = point(day.resolved, index); return <g key={day.label}><circle cx={a.x} cy={a.y} r="5" fill="#0369a1" role="button" tabIndex="0" aria-label={`${day.opened} abertos em ${day.label}`} onClick={() => selectTrendDay(day, "opened")} onKeyDown={(event) => event.key === "Enter" && selectTrendDay(day, "opened")} className="cursor-pointer" /><circle cx={r.x} cy={r.y} r="5" fill="#059669" role="button" tabIndex="0" aria-label={`${day.resolved} resolvidos em ${day.label}`} onClick={() => selectTrendDay(day, "resolved")} onKeyDown={(event) => event.key === "Enter" && selectTrendDay(day, "resolved")} className="cursor-pointer" />{(index % Math.max(1, Math.ceil(trend.length / 8)) === 0 || index === trend.length - 1) && <text x={a.x} y={chartHeight - 3} fontSize="9" textAnchor="middle" fill="#64748b">{day.label}</text>}</g>; })}</svg></div><p className="text-[10.8px] text-slate-500">Clique em um ponto para filtrar a lista.</p></section>
          <section className="border border-slate-300 bg-white p-4"><h2 className="text-xs font-semibold">Chamados por categoria</h2><div className="mt-4 space-y-3">{categoryCounts.map(({ category, count }) => <button key={category} type="button" onClick={() => setSelectedRows(filtered.filter((ticket) => ticket.category?.toUpperCase() === category))} className="group block w-full text-left"><span className="mb-1 flex justify-between text-[12px]"><span>{category}</span><strong>{count}</strong></span><span className="block h-2 rounded-full bg-slate-100"><span className="block h-full rounded-full bg-sky-700 group-hover:bg-sky-900" style={{ width: `${count ? Math.max(3, count / Math.max(1, ...categoryCounts.map((item) => item.count)) * 100) : 0}%` }} /></span></button>)}</div></section>
        </div>
        <section className="border border-slate-300 bg-white p-4"><h2 className="text-xs font-semibold">Chamados por setor</h2><div className="mt-3 flex flex-wrap gap-2">{sectorCounts.map(({ department, count }) => <button key={department} type="button" onClick={() => setSelectedRows(filtered.filter((ticket) => ticket.department === department))} className="flex items-center gap-3 border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50">{department}<strong className="font-mono text-sky-800">{count}</strong></button>)}</div></section>
        <section className="border border-slate-300 bg-white p-4"><h2 className="text-xs font-semibold">Carga por resolutor</h2><p className="mt-1 text-[10.8px] text-slate-500">Indicadores para distribuição de carga, não para ranqueamento.</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-120 text-left text-[12px]"><thead className="bg-slate-100 text-[9.6px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">Resolutor</th><th className="px-3 py-2">Atendidos</th><th className="px-3 py-2">Tempo médio</th><th className="px-3 py-2">No SLA</th></tr></thead><tbody>{resolverStats.map((row) => <tr key={row.resolver} className="border-t border-slate-200"><td className="px-3 py-2">{row.resolver}</td><td className="px-3 py-2">{row.assigned}</td><td className="px-3 py-2">{row.average === null ? "—" : `${row.average.toFixed(1)} h`}</td><td className="px-3 py-2">{row.sla}%</td></tr>)}</tbody></table></div></section>
      </>}

      {filters.section === "SLA" && <div className="grid gap-4 lg:grid-cols-2"><section className="border border-rose-200 bg-white p-4"><h2 className="text-xs font-semibold text-rose-700">Vencidos · {overdue.length}</h2><TicketList tickets={overdue} onSelect={setSelectedRows} /></section><section className="border border-amber-200 bg-white p-4"><h2 className="text-xs font-semibold text-amber-700">Quase vencendo · {almostDue.length}</h2><TicketList tickets={almostDue} onSelect={setSelectedRows} /></section><section className="border border-slate-300 bg-white p-4 lg:col-span-2"><label className="flex items-center gap-2 text-xs">Chamados parados há mais de<input type="number" min="1" value={filters.stalledDays} onChange={(event) => change("stalledDays", Math.max(1, Number(event.target.value) || 1))} className="w-20 rounded border border-slate-300 px-2 py-1" />dias · {stalled.length}</label><TicketList tickets={stalled} onSelect={setSelectedRows} /></section><section className="border border-slate-300 bg-white p-4 lg:col-span-2"><h2 className="text-xs font-semibold">Reabertos · {reopened.length}</h2><TicketList tickets={reopened} onSelect={setSelectedRows} /></section></div>}

      {filters.section === "Inventário" && <section className="border border-slate-300 bg-white p-4"><h2 className="text-xs font-semibold">Equipamentos com mais chamados</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-100 text-left text-[12px]"><thead className="bg-slate-100 text-[9.6px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">Ativo</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Chamados no período</th></tr></thead><tbody>{assets.map((asset) => ({ ...asset, count: filtered.filter((ticket) => ticket.assetId === asset.id).length })).sort((a, b) => b.count - a.count).map((asset) => <tr key={asset.id} className="border-t border-slate-200"><td className="px-3 py-2">{asset.nome} · {asset.id}</td><td className="px-3 py-2">{asset.tipo}</td><td className="px-3 py-2">{asset.count}</td></tr>)}</tbody></table></div></section>}

      {filters.section === "Usuários" && <div className="grid gap-3 sm:grid-cols-3"><Metric label="Aprovados no período" value={users.filter((user) => { const date = parseDate(user.approvedAt); return date && date >= start && date <= end; }).length} note="Cadastros liberados" /><Metric label="Recusados no período" value={users.filter((user) => user.status === "RECUSADO" && (() => { const date = parseDate(user.rejectedAt); return date && date >= start && date <= end; })()).length} note="Cadastros recusados" tone="text-rose-700" /><Metric label="Pendentes" value={users.filter((user) => user.status === "PENDENTE").length} note="Aguardando perfil" tone="text-amber-700" /></div>}

      <section className="border border-slate-300 bg-white p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xs font-semibold">{selectedRows ? "Chamados do recorte selecionado" : "Chamados no período"} · {ordered.length}</h2>{selectedRows && <button type="button" onClick={() => setSelectedRows(null)} className="reports-no-print text-[12px] text-sky-800 hover:underline">Limpar recorte</button>}</div><TicketsTable tickets={ordered} sort={filters.sort} direction={filters.direction} onSort={sortColumn} /></section>
    </section>
  );
}

function SelectFilter({ label, value, options, onChange }) {
  return <label className="flex flex-col gap-1 text-[10.8px] text-slate-500">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className={FIELD}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
