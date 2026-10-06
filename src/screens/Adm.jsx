import { useEffect, useState } from "react";
import AbrirChamado from "./AbrirChamado.jsx";
import ReportsPanel from "./ReportsPanel.jsx";
import SettingsPanel, { AuditPanel } from "./SettingsPanel.jsx";
import {
  getRegistrationNotificationKey,
  getTicketNotificationKey,
  NotificationsPanel,
  ProfilePanel,
} from "./User.jsx";
import { buildDefaultDatabase, loadLocalDatabase, saveLocalDatabase } from "../lib/db.js";

const menuItems = [
  { label: "Dashboard", icon: "▦" },
  { label: "Meus Chamados", icon: "▤", count: "6" },
  { label: "Abrir Chamado", icon: "+" },
  { label: "Histórico", icon: "◷", divider: true },
  { label: "Usuários", icon: "♙" },
  { label: "Inventário", icon: "◇" },
  { label: "Relatórios", icon: "▥" },
  { label: "Auditoria", icon: "♢", divider: true },
  { label: "Configurações", icon: "☼" },
  { label: "Notificações", icon: "♧", count: "4", divider: true },
  { label: "Meu Perfil", icon: "♙" },
];

const resolverMenuItems = [
  { label: "Dashboard", icon: "▦" },
  { label: "Meus Chamados", icon: "▤", count: "6" },
  { label: "Notificações", icon: "♧", count: "4", divider: true },
  { label: "Meu Perfil", icon: "♙" },
];

const userProfiles = ["Administrador", "Supervisor", "Resolutor", "Usuário Comum"];

function parseTicketDate(value) {
  if (!value) return null;
  const normalized = typeof value === "string" && value.includes(" ") && !value.includes("T")
    ? value.replace(" ", "T")
    : value;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isClosedTicket(ticket) {
  return ["FECHADO", "SOLUCIONADO", "RESOLVIDO"].includes(ticket.status);
}

function getTicketDeadline(ticket) {
  if (ticket.status === "AGUARDANDO") return null;
  const deadline = ticket.status === "ABERTO"
    ? ticket.responseDueAt ?? ticket.resolutionDueAt
    : ticket.resolutionDueAt ?? ticket.responseDueAt;
  return parseTicketDate(deadline);
}

function formatTimeRemaining(deadline, now) {
  if (deadline === null) return "SLA pausado";
  const remainingMinutes = Math.ceil((deadline - now) / 60000);
  const absoluteMinutes = Math.abs(remainingMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  const duration = hours ? `${hours}h ${minutes}min` : `${minutes} min`;
  return remainingMinutes < 0 ? `Vencido há ${duration}` : remainingMinutes === 0 ? "Vence agora" : `${duration} restante(s)`;
}

function priorityWeight(priority) {
  const normalized = String(priority ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return ({ CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 })[normalized] ?? 4;
}

function ticketMetSla(ticket) {
  if (ticket.sla?.toUpperCase().includes("RESOLVIDO NO PRAZO")) return true;
  if (ticket.sla?.toUpperCase().includes("VENCEU")) return false;
  const closedAt = parseTicketDate(ticket.closedAt ?? ticket.updatedAt ?? ticket.date);
  const deadline = parseTicketDate(ticket.resolutionDueAt);
  return closedAt !== null && deadline !== null && closedAt <= deadline;
}

function ResolverDashboard({
  user,
  tickets,
  onAvailabilityChange,
  onOpenTicket,
  onViewAssigned,
}) {
  const [now, setNow] = useState(Date.now());
  const activeTickets = tickets.filter((ticket) => !isClosedTicket(ticket));
  const actionableTickets = activeTickets.filter((ticket) => ticket.status !== "AGUARDANDO");
  const awaitingTickets = activeTickets.filter((ticket) => ticket.status === "AGUARDANDO");
  const newTickets = activeTickets.filter((ticket) => ticket.assignedAt && !ticket.resolverOpenedAt);
  const dueSoonTickets = actionableTickets.filter((ticket) => {
    const deadline = getTicketDeadline(ticket);
    return deadline !== null && deadline - now <= 2 * 60 * 60 * 1000;
  });
  const overdueCount = dueSoonTickets.filter((ticket) => {
    const deadline = getTicketDeadline(ticket);
    return deadline !== null && deadline <= now;
  }).length;
  const inProgressCount = activeTickets.filter((ticket) => ticket.status === "EM ANDAMENTO").length;
  const last30Days = now - 30 * 24 * 60 * 60 * 1000;
  const recentlyResolved = tickets.filter((ticket) => {
    if (!isClosedTicket(ticket)) return false;
    const resolvedAt = parseTicketDate(ticket.closedAt ?? ticket.updatedAt ?? ticket.date);
    return resolvedAt !== null && resolvedAt >= last30Days && resolvedAt <= now;
  });
  const onTimeResolved = recentlyResolved.filter(ticketMetSla).length;
  const onTimeRate = recentlyResolved.length
    ? Math.round((onTimeResolved / recentlyResolved.length) * 100)
    : 0;
  const slaCounts = actionableTickets.reduce((counts, ticket) => {
    const deadline = getTicketDeadline(ticket);
    if (deadline === null || deadline <= now) counts.overdue += 1;
    else if (deadline - now <= 2 * 60 * 60 * 1000) counts.attention += 1;
    else counts.onTime += 1;
    return counts;
  }, { onTime: 0, attention: 0, overdue: 0 });
  const slaTotal = slaCounts.onTime + slaCounts.attention + slaCounts.overdue;
  const onTimePercent = slaTotal ? Math.floor((slaCounts.onTime / slaTotal) * 100) : 0;
  const attentionPercent = slaTotal ? Math.floor((slaCounts.attention / slaTotal) * 100) : 0;
  const slaPercentages = [onTimePercent, attentionPercent, slaTotal ? 100 - onTimePercent - attentionPercent : 0];
  const priorityRank = (ticket) => priorityWeight(ticket.priority);
  const sortedTickets = [...actionableTickets].sort((first, second) => {
    const firstDeadline = getTicketDeadline(first);
    const secondDeadline = getTicketDeadline(second);
    const firstOverdue = firstDeadline !== null && firstDeadline <= now;
    const secondOverdue = secondDeadline !== null && secondDeadline <= now;
    if (firstOverdue !== secondOverdue) return firstOverdue ? -1 : 1;
    if (firstDeadline !== secondDeadline) {
      if (firstDeadline === null) return 1;
      if (secondDeadline === null) return -1;
      return firstDeadline - secondDeadline;
    }
    return priorityRank(first) - priorityRank(second);
  });
  const currentStatus = user?.resolverStatus ??
    (activeTickets.length ? "EM_ATENDIMENTO" : "DISPONIVEL");
  const availabilityOptions = [
    ["DISPONIVEL", "Disponível"],
    ["EM_ATENDIMENTO", "Em atendimento"],
    ["AUSENTE", "Ausente"],
  ];
  const recentDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
  const chartData = recentDays.map((date) => {
    const dayEnd = new Date(date);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const opened = tickets.filter((ticket) => {
      const createdAt = parseTicketDate(ticket.createdAt ?? ticket.date);
      return createdAt !== null && createdAt >= date.getTime() && createdAt < dayEnd.getTime();
    }).length;
    const resolved = tickets.filter((ticket) => {
      if (!isClosedTicket(ticket)) return false;
      const resolvedAt = parseTicketDate(ticket.closedAt ?? ticket.updatedAt ?? ticket.date);
      return resolvedAt !== null && resolvedAt >= date.getTime() && resolvedAt < dayEnd.getTime();
    }).length;
    return {
      label: date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      opened,
      resolved,
    };
  });
  const maxChartCount = Math.max(1, ...chartData.flatMap(({ opened, resolved }) => [opened, resolved]));

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10.8px] uppercase tracking-widest text-sky-700">Área do resolutor</p>
          <h1 className="mt-1 text-xl font-bold">Olá, {user?.nome ?? "Resolutor"}</h1>
          <p className="mt-1 text-[12px] text-slate-500">Seus chamados e próximas ações.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onViewAssigned}
            className="rounded bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-emerald-700"
          >
            Ver chamados para responder ({activeTickets.length})
          </button>
        </div>
      </div>

      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-slate-300 bg-white p-3">
        <div>
          <h2 className="text-sm font-semibold">Minha disponibilidade</h2>
          <p className="mt-1 text-xs text-slate-500">O administrador usa este status para decidir novas atribuições.</p>
        </div>
        <div role="group" aria-label="Minha disponibilidade" className="flex flex-wrap gap-2">
          {availabilityOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={currentStatus === value}
              onClick={() => onAvailabilityChange(value)}
              className={`rounded border px-3 py-2 text-xs font-semibold ${
                currentStatus === value
                  ? value === "AUSENTE"
                    ? "border-red-300 bg-red-50 text-red-800"
                    : value === "EM_ATENDIMENTO"
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ResolverMetric label="Novos para mim" value={newTickets.length} note="Atribuídos e ainda não abertos" />
        <ResolverMetric label="Meus chamados abertos" value={activeTickets.length} note={`${inProgressCount} em andamento`} />
        <ResolverMetric
          label="Vencendo ou vencidos"
          value={dueSoonTickets.length}
          note={`${overdueCount} vencido(s) · ${dueSoonTickets.length - overdueCount} vencendo`}
          urgent={dueSoonTickets.length > 0}
        />
        <ResolverMetric
          label="Resolvidos por mim"
          value={recentlyResolved.length}
          note={`${onTimeRate}% dentro do SLA · últimos 30 dias`}
        />
      </section>

      <section className="mt-4 overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold">Para fazer agora</h2>
          <p className="mt-1 text-xs text-slate-500">Atrasados primeiro; chamados aguardando estão separados porque o SLA está pausado.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 border-collapse text-left text-[12px]">
            <thead className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">ID</th>
                <th className="px-3 py-3 font-medium">Título</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Prioridade</th>
                <th className="px-3 py-3 font-medium">SLA restante</th>
              </tr>
            </thead>
            <tbody>
              {sortedTickets.map((ticket) => {
                const deadline = getTicketDeadline(ticket);
                const overdue = deadline !== null && deadline <= now;
                return (
                  <tr
                    key={ticket.id}
                    tabIndex={0}
                    onClick={() => onOpenTicket(ticket.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenTicket(ticket.id);
                      }
                    }}
                    className="cursor-pointer border-t border-slate-200 text-slate-700 hover:bg-sky-50 focus:bg-sky-50 focus:outline-none"
                  >
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-sky-800">{ticket.id}</td>
                    <td className="max-w-80 truncate px-3 py-3">{ticket.title}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className={`rounded border px-2 py-1 text-[10px] font-semibold ${
                        ticket.status === "ABERTO"
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : "border-amber-300 bg-amber-50 text-amber-800"
                      }`}>{ticket.status}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{ticket.priority}</td>
                    <td className={`whitespace-nowrap px-3 py-3 font-semibold ${overdue ? "text-red-700" : "text-slate-600"}`}>
                      {formatTimeRemaining(deadline, now)}
                    </td>
                  </tr>
                );
              })}
              {awaitingTickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  tabIndex={0}
                  onClick={() => onOpenTicket(ticket.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenTicket(ticket.id);
                    }
                  }}
                  className="cursor-pointer border-t border-slate-200 bg-amber-50/60 text-slate-700 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none"
                >
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-sky-800">{ticket.id}</td>
                  <td className="max-w-80 truncate px-3 py-3">{ticket.title}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">AGUARDANDO · SLA PAUSADO</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">{ticket.priority}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500">Não depende do resolutor</td>
                </tr>
              ))}
              {!activeTickets.length && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Você não tem chamados abertos atribuídos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-3">
        <article className="rounded border border-slate-300 bg-white p-4 shadow-sm xl:col-span-2">
          <h2 className="text-sm font-bold">Meus chamados — últimos 7 dias</h2>
          <p className="mb-3 mt-1 text-xs text-slate-500">Abertos e resolvidos atribuídos a você.</p>
          <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600" aria-label="Legenda do gráfico">
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-slate-300" />Abertos</span>
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-sky-700" />Resolvidos</span>
          </div>
          <div className="grid h-40 grid-cols-7 items-end gap-2 border-b border-slate-200">
            {chartData.map(({ label, opened, resolved }, index) => (
              <div key={`${label}-${index}`} className="flex h-full flex-col items-center justify-end gap-1">
                <div className="flex h-[calc(100%-18px)] items-end gap-1">
                  <span className="w-3 rounded-t bg-slate-300" style={{ height: `${Math.max(opened ? 4 : 0, opened / maxChartCount * 100)}%` }} title={`${opened} abertos`} />
                  <span className="w-3 rounded-t bg-sky-700" style={{ height: `${Math.max(resolved ? 4 : 0, resolved / maxChartCount * 100)}%` }} title={`${resolved} resolvidos`} />
                </div>
                <span className="text-[10px] capitalize text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded border border-slate-300 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold">Status do SLA</h2>
          <p className="mb-4 mt-1 text-xs text-slate-500">Chamados ativos, exceto os que estão aguardando.</p>
          {[
            ["Dentro do prazo", slaCounts.onTime, slaPercentages[0], "bg-emerald-500"],
            ["Em atenção", slaCounts.attention, slaPercentages[1], "bg-amber-500"],
            ["Vencidos", slaCounts.overdue, slaPercentages[2], "bg-red-500"],
          ].map(([label, count, percent, color]) => (
            <div key={label} className="mb-4">
              <div className="mb-1 flex justify-between gap-2 text-xs text-slate-600">
                <span>{label} · {count}</span>
                <span>{percent}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
              </div>
            </div>
          ))}
          {!slaTotal && <p className="text-xs text-slate-500">Sem chamados com SLA ativo no momento.</p>}
        </article>
      </section>
    </div>
  );
}

function ResolverMetric({ label, value, note, urgent = false }) {
  return (
    <article className={`rounded border bg-white p-3 shadow-sm ${urgent ? "border-red-300" : "border-slate-300"}`}>
      <p className="text-[10.8px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`my-2 text-2xl font-bold ${urgent ? "text-red-700" : "text-slate-800"}`}>{value}</p>
      <p className="text-[10.8px] text-slate-500">{note}</p>
    </article>
  );
}

function formatCpf(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function Adm({
  user,
  role = "Administrador",
  ticketStatus = "EM ANDAMENTO",
  onResolved,
  tickets = [],
  settings = {},
  auditLogs = [],
  onSaveSettings,
  onCreateTicket,
  onReplyToTicket,
  onResolveTicket,
  onAssignTicket,
  onUpdateTicketPriority,
  onReturnTicket,
  onUpdateResolverStatus,
  onOpenResolverTicket,
  onSaveProfile,
  onSavePreferences,
  onChangePassword,
  onLogout,
}) {
  const [active, setActive] = useState("Dashboard");
  const [ticketSearch, setTicketSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos os status");
  const [priorityFilter, setPriorityFilter] = useState("Todas prioridades");
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [userProfileFilter, setUserProfileFilter] = useState("Todos os perfis");
  const [showNewUser, setShowNewUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUserCpf, setNewUserCpf] = useState("");
  const [userFormError, setUserFormError] = useState("");
  const [assets, setAssets] = useState([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("Todos os tipos");
  const [assetStatusFilter, setAssetStatusFilter] = useState("Todos os status");
  const [showNewAsset, setShowNewAsset] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(Boolean(user?.preferences?.appearance?.sidebarCollapsed));
  const [sidebarError, setSidebarError] = useState("");
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [ticketDraft, setTicketDraft] = useState(null);
  const [selectedResolverTicketId, setSelectedResolverTicketId] = useState(null);
  const [profileIcon, setProfileIcon] = useState(() => {
    const savedIcon = localStorage.getItem(`pixie-profile-icon-${user?.id ?? "default"}`)
      || localStorage.getItem("pixie-profile-icon") || "";
    return savedIcon.startsWith("data:image/") ? savedIcon : "";
  });
  const userName = user?.nome ?? role;
  const userInitials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((name) => name[0]).join("").toUpperCase();
  const visibleMenuItems = role === "Resolutor" ? resolverMenuItems : menuItems;
  const pendingUsers = users.filter((item) =>
    item.status === "PENDENTE" || item.profile === "Pendente"
  );
  const readNotificationIds = Array.isArray(user?.preferences?.notifications?.readNotificationIds)
    ? user.preferences.notifications.readNotificationIds
    : [];
  const notificationCount = role === "Resolutor"
    ? tickets.filter((ticket) =>
        ticket.assignedResolverId === user?.id &&
        !ticket.resolverOpenedAt &&
        !["SOLUCIONADO", "FECHADO", "RESOLVIDO"].includes(ticket.status)
      ).length
    : tickets.filter((ticket) =>
        !readNotificationIds.includes(getTicketNotificationKey(ticket))
      ).length + (role === "Administrador"
        ? pendingUsers.filter((pendingUser) =>
            !readNotificationIds.includes(getRegistrationNotificationKey(pendingUser))
          ).length
        : 0);
  const activeTicketCount = tickets.filter((ticket) =>
    (role !== "Resolutor" || ticket.assignedResolverId === user?.id) &&
    ["ABERTO", "EM ANDAMENTO"].includes(ticket.status)
  ).length;
  const isHistory = active === "Histórico";
  useEffect(() => {
    setSidebarCollapsed(Boolean(user?.preferences?.appearance?.sidebarCollapsed));
  }, [user?.preferences?.appearance?.sidebarCollapsed]);
  useEffect(() => {
    setUsers((currentUsers) => currentUsers.map((item) =>
      item.id === user?.id ? { ...item, ...user } : item
    ));
  }, [user]);
  useEffect(() => {
    const loadData = async () => {
      try {
        const database = await loadLocalDatabase();
        setUsers(database.users ?? []);
        const loadedAssets = database.assets ?? buildDefaultDatabase().assets;
        setAssets(loadedAssets);
        if (!Array.isArray(database.assets)) {
          await saveLocalDatabase({ ...database, assets: loadedAssets });
        }
      } catch (error) {
        console.error("Erro ao carregar dados locais:", error);
      }
    };
    loadData();
  }, []);

  const filteredUsers = users.filter((item) => {
    const query = userSearch.trim().toLowerCase();
    const searchable = [item.nome, item.email, item.cpf, item.departamento, item.cargo]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      (!query || searchable.includes(query)) &&
      (userProfileFilter === "Todos os perfis" || item.profile === userProfileFilter)
    );
  });
  const filteredAssets = assets.filter((asset) => {
    const query = assetSearch.trim().toLowerCase();
    const searchable = [asset.id, asset.nome, asset.numeroSerie]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      (!query || searchable.includes(query)) &&
      (assetTypeFilter === "Todos os tipos" || asset.tipo === assetTypeFilter) &&
      (assetStatusFilter === "Todos os status" || asset.status === assetStatusFilter)
    );
  });
  const assetStatuses = ["ATIVO", "MANUTENÇÃO", "INATIVO", "DESCARTADO"];
  const dashboardOpenTickets = tickets.filter((ticket) => !isClosedTicket(ticket));
  const dashboardClosedTickets = tickets.filter(isClosedTicket);
  const dashboardOverdueTickets = dashboardOpenTickets.filter((ticket) => {
    const deadline = getTicketDeadline(ticket);
    return deadline !== null && deadline < Date.now();
  });
  const dashboardResolvedLast30Days = dashboardClosedTickets.filter((ticket) => {
    const resolvedAt = parseTicketDate(ticket.closedAt ?? ticket.updatedAt ?? ticket.date);
    return resolvedAt !== null && resolvedAt >= Date.now() - 30 * 24 * 60 * 60 * 1000;
  });
  const dashboardResolutionRate = dashboardResolvedLast30Days.length
    ? Math.round((dashboardResolvedLast30Days.filter(ticketMetSla).length / dashboardResolvedLast30Days.length) * 100)
    : 0;
  const dashboardMetrics = [
    ["Chamados abertos", dashboardOpenTickets.length, `${dashboardOpenTickets.filter((ticket) => ticket.status === "EM ANDAMENTO").length} em andamento`, "text-slate-800"],
    ["SLA vencido", dashboardOverdueTickets.length, `${dashboardOverdueTickets.filter((ticket) => ticket.priority === "CRÍTICA" || ticket.priority === "CRITICA").length} críticos`, dashboardOverdueTickets.length ? "text-red-600" : "text-slate-800"],
    ["Ativos cadastrados", assets.length, `${assets.filter((asset) => asset.status === "MANUTENÇÃO").length} em manutenção`, "text-slate-800"],
    ["Resolvidos no SLA", `${dashboardResolutionRate}%`, `${dashboardResolvedLast30Days.length} nos últimos 30 dias`, "text-emerald-600"],
  ];
  const dashboardChartDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - index));
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    const opened = tickets.filter((ticket) => {
      const created = parseTicketDate(ticket.createdAt ?? ticket.date);
      return created !== null && created >= day.getTime() && created < nextDay.getTime();
    }).length;
    const resolved = dashboardClosedTickets.filter((ticket) => {
      const closed = parseTicketDate(ticket.closedAt ?? ticket.updatedAt ?? ticket.date);
      return closed !== null && closed >= day.getTime() && closed < nextDay.getTime();
    }).length;
    return { label: day.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), opened, resolved };
  });
  const dashboardMaxChartCount = Math.max(1, ...dashboardChartDays.flatMap(({ opened, resolved }) => [opened, resolved]));
  const dashboardSlaTickets = dashboardOpenTickets.filter((ticket) => ticket.status !== "AGUARDANDO");
  const dashboardSlaCounts = {
    onTime: dashboardSlaTickets.filter((ticket) => {
      const deadline = getTicketDeadline(ticket);
      return deadline !== null && deadline - Date.now() > 2 * 60 * 60 * 1000;
    }).length,
    attention: dashboardSlaTickets.filter((ticket) => {
      const deadline = getTicketDeadline(ticket);
      return deadline !== null && deadline > Date.now() && deadline - Date.now() <= 2 * 60 * 60 * 1000;
    }).length,
    overdue: dashboardSlaTickets.filter((ticket) => {
      const deadline = getTicketDeadline(ticket);
      return deadline === null || deadline <= Date.now();
    }).length,
  };
  const dashboardSlaTotal = dashboardSlaTickets.length;
  const dashboardOnTimePercent = dashboardSlaTotal ? Math.floor((dashboardSlaCounts.onTime / dashboardSlaTotal) * 100) : 0;
  const dashboardAttentionPercent = dashboardSlaTotal ? Math.floor((dashboardSlaCounts.attention / dashboardSlaTotal) * 100) : 0;
  const dashboardSlaStatus = [
    ["Dentro do prazo", dashboardSlaCounts.onTime, dashboardOnTimePercent, "bg-emerald-500"],
    ["Em atenção", dashboardSlaCounts.attention, dashboardAttentionPercent, "bg-amber-500"],
    ["Vencidos", dashboardSlaCounts.overdue, dashboardSlaTotal ? 100 - dashboardOnTimePercent - dashboardAttentionPercent : 0, "bg-red-500"],
  ];
  const visibleTickets = role === "Resolutor"
    ? tickets.filter((ticket) => ticket.assignedResolverId === user?.id)
    : tickets;
  const filteredTickets = visibleTickets.filter((ticket) => {
    const query = ticketSearch.trim().toLowerCase();
    return (
      (!isHistory || ["FECHADO", "SOLUCIONADO", "RESOLVIDO"].includes(ticket.status)) &&
      (!query || `${ticket.id} ${ticket.title}`.toLowerCase().includes(query)) &&
      (isHistory || statusFilter === "Todos os status" || ticket.status === statusFilter) &&
      (priorityFilter === "Todas prioridades" || ticket.priority === priorityFilter)
    );
  });
  const resolvers = users.filter((item) => item.profile === "Resolutor");
  const openAssignmentCount = (resolverId) => tickets.filter((ticket) =>
    ticket.assignedResolverId === resolverId && !["FECHADO", "SOLUCIONADO", "RESOLVIDO"].includes(ticket.status)
  ).length;
  const resolverAvailability = (resolver) => resolver.resolverStatus === "AUSENTE"
    ? "Ausente"
    : resolver.resolverStatus === "EM_ATENDIMENTO" ||
      (!resolver.resolverStatus && openAssignmentCount(resolver.id) > 0)
      ? "Em atendimento"
      : "Disponível";

  async function submitAssignment(ticket) {
    const draft = assignmentDrafts[ticket.id];
    if (!draft?.resolverId || !draft.reason?.trim()) return;
    try {
      await onAssignTicket?.(ticket.id, draft.resolverId, draft.reason);
      setAssignmentDrafts((current) => ({ ...current, [ticket.id]: { resolverId: draft.resolverId, reason: "" } }));
    } catch (error) {
      console.error("Erro ao atribuir chamado:", error);
      window.alert(error.message || "Não foi possível atribuir o chamado.");
    }
  }

  async function updateAvailability(status) {
    try {
      await onUpdateResolverStatus?.(status);
      setSidebarError("");
    } catch (error) {
      console.error("Erro ao atualizar disponibilidade:", error);
      window.alert(error.message || "Não foi possível atualizar sua disponibilidade.");
    }
  }

  async function updatePriority(ticketId, priority) {
    try {
      await onUpdateTicketPriority?.(ticketId, priority);
    } catch (error) {
      console.error("Erro ao atualizar prioridade:", error);
      window.alert(error.message || "Não foi possível alterar a prioridade.");
    }
  }

  async function handleSaveUser(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const cpfDigits = newUserCpf.replace(/\D/g, "");

    if (cpfDigits.length !== 11) {
      setUserFormError("Informe um CPF com 11 dígitos.");
      return;
    }

    const database = await loadLocalDatabase();
    if (database.users.some((item) =>
      item.id !== editingUser?.id && item.cpf?.replace(/\D/g, "") === cpfDigits
    )) {
      setUserFormError("Já existe um usuário cadastrado com este CPF.");
      return;
    }

    const savedUser = {
      ...editingUser,
      id: editingUser?.id ?? `user-${Date.now()}`,
      nome: formData.get("nome").toString().trim(),
      cpf: formatCpf(cpfDigits),
      email: formData.get("email").toString().trim(),
      departamento: formData.get("departamento").toString().trim(),
      cargo: formData.get("cargo").toString().trim(),
      profile: formData.get("profile").toString(),
      senha: formData.get("senha").toString(),
      status: editingUser?.status ?? "ATIVO",
      createdAt: editingUser?.createdAt ?? new Date().toISOString(),
      lastLoginAt: editingUser?.lastLoginAt ?? null,
      mustChangePassword: editingUser
        ? (editingUser.senha !== formData.get("senha").toString() || Boolean(editingUser.mustChangePassword))
        : true,
    };
    const nextUsers = editingUser
      ? database.users.map((item) => item.id === editingUser.id ? savedUser : item)
      : [...database.users, savedUser];
    await saveLocalDatabase({ ...database, users: nextUsers });
    setUsers(nextUsers);
    setShowNewUser(false);
    setEditingUser(null);
    setNewUserCpf("");
    setUserFormError("");
    form.reset();
  }

  async function assignPendingUser(targetUser, profile, initialPassword) {
    if (!initialPassword) return;

    const database = await loadLocalDatabase();
    const nextUsers = database.users.map((item) => item.id === targetUser.id
      ? { ...item, profile, senha: initialPassword, mustChangePassword: true, status: "ATIVO", approvedAt: new Date().toISOString(), approvedBy: user?.id }
      : item);
    await saveLocalDatabase({ ...database, users: nextUsers });
    setUsers(nextUsers);
  }

  async function rejectPendingUser(targetUser) {
    const database = await loadLocalDatabase();
    const rejectedAt = new Date().toISOString();
    const nextUsers = database.users.map((item) => item.id === targetUser.id
      ? { ...item, profile: "Recusado", status: "RECUSADO", rejectedAt, rejectedBy: user?.nome ?? role }
      : item);
    await saveLocalDatabase({ ...database, users: nextUsers });
    setUsers(nextUsers);
  }

  async function handleCreateAsset(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const database = await loadLocalDatabase();
    const savedAsset = {
      id: `ATI-${String(Date.now()).slice(-4)}`,
      nome: formData.get("nome").toString().trim(),
      tipo: formData.get("tipo").toString(),
      marcaModelo: formData.get("marcaModelo").toString().trim(),
      numeroSerie: formData.get("numeroSerie").toString().trim(),
      status: formData.get("status").toString(),
      responsavel: formData.get("responsavel").toString().trim(),
      departamento: formData.get("departamento").toString().trim(),
      aquisicao: formData.get("aquisicao").toString(),
      chamados: 0,
    };
    const nextAssets = [...(database.assets ?? assets), savedAsset];
    await saveLocalDatabase({ ...database, assets: nextAssets });
    setAssets(nextAssets);
    setShowNewAsset(false);
  }

  async function toggleUserStatus(targetUser) {
    const database = await loadLocalDatabase();
    const nextUsers = database.users.map((item) => item.id === targetUser.id
      ? { ...item, status: (item.status ?? "ATIVO") === "BLOQUEADO" ? "ATIVO" : "BLOQUEADO" }
      : item);
    await saveLocalDatabase({ ...database, users: nextUsers });
    setUsers(nextUsers);
  }

  function openUserEditor(targetUser) {
    setEditingUser(targetUser);
    setNewUserCpf(formatCpf(targetUser.cpf ?? ""));
    setUserFormError("");
    setShowNewUser(true);
  }

  function changeProfileIcon(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 512 * 1024) {
      window.alert("Escolha uma imagem de até 512 KB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageData = String(reader.result);
      setProfileIcon(imageData);
      localStorage.setItem(`pixie-profile-icon-${user?.id ?? "default"}`, imageData);
    };
    reader.onerror = () => window.alert("Não foi possível carregar o ícone selecionado.");
    reader.readAsDataURL(file);
  }

  async function toggleSidebar() {
    const nextCollapsed = !sidebarCollapsed;
    const currentPreferences = user?.preferences ?? {};
    const nextPreferences = {
      ...currentPreferences,
      appearance: {
        ...currentPreferences.appearance,
        sidebarCollapsed: nextCollapsed,
      },
    };
    try {
      await onSavePreferences?.(nextPreferences);
      setSidebarCollapsed(nextCollapsed);
      setSidebarError("");
    } catch (error) {
      console.error("Erro ao salvar preferência do menu:", error);
      setSidebarError("Não foi possível salvar a preferência do menu.");
    }
  }

  return (
    <div className="flex h-screen min-h-135 flex-col overflow-hidden bg-slate-100 text-slate-800">
      <header className="flex h-10 shrink-0 items-center justify-center bg-[#2a7b7e] px-4 text-[12px] uppercase tracking-wider text-amber-400">
        <span className="uppercase tracking-wider text-amber-400">
          Offline · Banco local
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className={`flex shrink-0 flex-col border-r border-slate-300 bg-slate-200/70 transition-[width] ${sidebarCollapsed ? "w-14" : "w-48"}`}>
          <div className={`flex h-8 items-center border-b border-slate-300 px-2 text-lg text-sky-700 ${sidebarCollapsed ? "justify-center" : "justify-end"}`}>
            <button type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"} title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}>
              {sidebarCollapsed ? "›" : "‹"}
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            {visibleMenuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setActive(item.label)}
                aria-label={sidebarCollapsed ? item.label : undefined}
                title={sidebarCollapsed ? item.label : undefined}
                className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-[13.2px] ${
                  item.divider ? "mt-3 border-t border-slate-300 pt-3" : ""
                } ${
                  active === item.label
                    ? "bg-white font-semibold text-sky-800 shadow-sm"
                    : "text-slate-600 hover:bg-white/70"
                }`}
              >
                <span className="flex w-4 justify-center text-sm text-sky-700">
                  {item.icon}
                </span>
                {!sidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                {(
                  item.label === "Notificações"
                    ? notificationCount > 0
                    : item.label === "Meus Chamados"
                      ? activeTicketCount > 0
                      : item.count || (role === "Administrador" && pendingUsers.length > 0)
                ) && !sidebarCollapsed && (
                  <span className="rounded bg-slate-600 px-1.5 py-0.5 text-[10.8px] font-bold text-white">
                    {item.label === "Notificações"
                      ? notificationCount
                      : item.label === "Meus Chamados"
                        ? activeTicketCount
                        : item.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="border-t border-slate-300 bg-slate-100/60 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-700 text-[12px] font-bold text-white">
                {userInitials}
              </div>
              {!sidebarCollapsed && <div className="min-w-0 text-[12px]">
                <strong className="block truncate">{userName}</strong>
                <span className="text-[9.6px] uppercase tracking-wider text-slate-500">
                  {role}
                </span>
              </div>}
            </div>
            <button
              type="button"
              onClick={() => onLogout?.()}
              className="mt-3 w-full rounded border border-red-200 bg-red-50 px-2 py-2 text-[10.8px] font-semibold uppercase tracking-wider text-red-700 transition hover:bg-red-100"
            >
              {sidebarCollapsed ? "↪" : "Sair da conta"}
            </button>
            {sidebarError && <p className="mt-2 text-[10.8px] text-red-700">{sidebarError}</p>}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {active === "Dashboard" && (role === "Resolutor" ? (
            <ResolverDashboard
              user={user}
              tickets={visibleTickets}
              onAvailabilityChange={updateAvailability}
              onOpenTicket={async (ticketId) => {
                try {
                  await onOpenResolverTicket?.(ticketId);
                  const ticket = tickets.find((item) => item.id === ticketId);
                  setSelectedResolverTicketId(ticket ? `ticket:${ticket.id}` : null);
                  setActive("Notificações");
                } catch (error) {
                  console.error("Erro ao abrir chamado do resolutor:", error);
                  window.alert(error.message || "Não foi possível abrir o chamado.");
                }
              }}
              onViewAssigned={() => {
                setSelectedResolverTicketId(null);
                setActive("Notificações");
              }}
            />
          ) : (
            <div>
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold">{active}</h1>
                  <p className="mt-1 text-[12px] uppercase tracking-wider text-slate-500">
                    Atualizado em {new Date().toLocaleDateString("pt-BR")} · dados locais
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActive("Abrir Chamado")}
                  className="rounded bg-slate-800 px-3 py-2 text-[12px] font-semibold text-white hover:bg-sky-800"
                >
                  + Abrir chamado
                </button>
              </div>

              {role === "Administrador" && (
                <button
                  type="button"
                  onClick={() => { setActive("Meus Chamados"); setStatusFilter("Todos os status"); }}
                  className="mb-4 flex w-full items-center justify-between rounded border border-amber-300 bg-amber-50 p-4 text-left text-amber-900 hover:bg-amber-100"
                >
                  <span>
                    <strong className="block text-sm">Sem responsável</strong>
                    <span className="mt-1 block text-xs">Chamados aguardando atribuição</span>
                  </span>
                  <span className="text-2xl font-bold">
                    {tickets.filter((ticket) => !ticket.assignedResolverId && !["FECHADO", "SOLUCIONADO", "RESOLVIDO"].includes(ticket.status)).length}
                  </span>
                </button>
              )}

              {role === "Administrador" && (
                <section className="mb-4 rounded border border-slate-300 bg-white p-3">
                  <h2 className="mb-2 text-sm font-semibold">Disponibilidade dos resolutores</h2>
                  <div className="flex flex-wrap gap-2">
                    {resolvers.map((resolver) => (
                      <span key={resolver.id} className="rounded border border-slate-200 px-3 py-2 text-xs">
                        <strong>{resolver.nome}</strong> · {resolverAvailability(resolver)} · {openAssignmentCount(resolver.id)} chamados
                      </span>
                    ))}
                    {resolvers.length === 0 && <span className="text-xs text-slate-500">Nenhum resolutor cadastrado.</span>}
                  </div>
                </section>
              )}

              <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {dashboardMetrics.map(([label, value, note, color]) => (
                  <article
                    key={label}
                    className="rounded border border-slate-300 bg-white p-3 shadow-sm"
                  >
                    <p className="text-[10.8px] font-semibold uppercase tracking-wider text-slate-500">
                      {label}
                    </p>
                    <p className={`my-2 text-2xl font-bold ${color}`}>
                      {value}
                    </p>
                    <p className="text-[10.8px] text-slate-500">{note}</p>
                  </article>
                ))}
              </section>

              <section className="mt-4 grid gap-4 xl:grid-cols-3">
                <article className="rounded border border-slate-300 bg-white p-4 shadow-sm xl:col-span-2">
                  <h2 className="text-sm font-bold">
                    Chamados — últimos 7 dias
                  </h2>
                  <div className="mb-4 flex gap-4 text-xs text-slate-600">
                    <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-slate-300" />Abertos</span>
                    <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-slate-700" />Resolvidos</span>
                  </div>
                  <div className="grid h-44 grid-cols-7 items-end gap-2 border-b border-slate-200">
                    {dashboardChartDays.map(({ label, resolved, opened }, index) => (
                      <div
                        key={`${label}-${index}`}
                        className="flex h-full flex-col items-center justify-end gap-1"
                      >
                        <div className="flex h-[calc(100%-18px)] items-end gap-1">
                          <span
                            className="w-3 rounded-t bg-slate-700"
                            style={{ height: `${resolved ? Math.max(4, resolved / dashboardMaxChartCount * 100) : 0}%` }}
                            title={`${resolved} resolvidos`}
                          />
                          <span
                            className="w-3 rounded-t bg-slate-300"
                            style={{ height: `${opened ? Math.max(4, opened / dashboardMaxChartCount * 100) : 0}%` }}
                            title={`${opened} abertos`}
                          />
                        </div>
                        <span className="text-[9.6px] capitalize text-slate-500">{label}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded border border-slate-300 bg-white p-4 shadow-sm">
                  <h2 className="mb-4 text-sm font-bold">Status SLA</h2>
                  {dashboardSlaStatus.map(([label, count, percent, color]) => (
                    <div key={label} className="mb-4">
                      <div className="mb-1 flex justify-between text-[12px] text-slate-600">
                        <span>{label} · {count}</span>
                        <span>{percent}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${color}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {!dashboardSlaTotal && <p className="text-xs text-slate-500">Sem chamados com SLA ativo.</p>}
                </article>
              </section>

              <section className="mt-4 overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-300 px-4 py-3">
                  <h2 className="text-sm font-bold">Chamados Recentes</h2>
                  <button
                    type="button"
                    onClick={() => setActive("Meus Chamados")}
                    className="text-[10.8px] font-semibold uppercase tracking-wider text-sky-700 hover:text-sky-900"
                  >
                    Ver todos →
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-212.5 border-collapse text-left text-[12px]">
                    <thead className="bg-slate-100 text-[9.6px] uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">ID</th>
                        <th className="px-4 py-2 font-medium">Título</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Prioridade</th>
                        <th className="px-4 py-2 font-medium">SLA</th>
                        <th className="px-4 py-2 font-medium">Responsável</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(role === "Resolutor" ? visibleTickets : tickets).slice(0, 6).map(
                        (ticket) => {
                          const { id, title, status, priority, sla = "—" } = ticket;
                          const owner = ticket.responsible ?? "Não atribuído";
                          const tone = status === "ABERTO" ? "blue" : status === "FECHADO" ? "green" : "amber";
                          return (
                            <tr
                              key={id}
                              className="border-t border-slate-200 text-slate-700 hover:bg-slate-50"
                            >
                              <td className="whitespace-nowrap px-4 py-3 font-mono text-[10.8px] text-sky-800">
                                {id}
                              </td>
                              <td className="max-w-70 truncate px-4 py-3">
                                {title}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`rounded border px-2 py-1 text-[9.6px] font-semibold tracking-wider ${
                                    tone === "amber"
                                      ? "border-amber-300 bg-amber-50 text-amber-600"
                                      : tone === "green"
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                                        : tone === "blue"
                                          ? "border-sky-200 bg-sky-50 text-sky-700"
                                          : "border-slate-300 bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  {status}
                                </span>
                              </td>
                              <td
                                className={`px-4 py-3 text-[10.8px] font-semibold tracking-wider ${priority === "ALTA" ? "text-amber-600" : "text-slate-500"}`}
                              >
                                {priority}
                              </td>
                              <td
                                className={`whitespace-nowrap px-4 py-3 text-[10.8px] tracking-wider ${sla.includes("VENCEU") ? "text-red-500" : "text-slate-500"}`}
                              >
                                {sla}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                                {owner}
                              </td>
                            </tr>
                          );
                        },
                      )}
                      {tickets.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">Nenhum chamado cadastrado.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

            </div>
          ))}
          {(active === "Meus Chamados" || isHistory) && (
            <section className="overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 p-3">
                <h1 className="text-base font-bold">
                  {isHistory ? "Histórico" : "Chamados"} <span className="text-xs font-normal text-slate-500">{filteredTickets.length} registros</span>
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    aria-label="Buscar chamado"
                    placeholder="Buscar chamado..."
                    value={ticketSearch}
                    onChange={(event) => setTicketSearch(event.target.value)}
                    className="w-44 rounded border border-slate-300 px-3 py-2 text-xs"
                  />
                  {!isHistory && (
                    <select
                      aria-label="Filtrar por status"
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      className="rounded border border-slate-300 bg-white px-2 py-2 text-xs"
                    >
                      <option>Todos os status</option>
                      {[...new Set(tickets.map((ticket) => ticket.status))].map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  )}
                  <select
                    aria-label="Filtrar por prioridade"
                    value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value)}
                    className="rounded border border-slate-300 bg-white px-2 py-2 text-xs"
                  >
                    <option>Todas prioridades</option>
                    {[...new Set(tickets.map((ticket) => ticket.priority))].map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                  {!isHistory && role !== "Resolutor" && (
                    <button
                      type="button"
                      onClick={() => setActive("Abrir Chamado")}
                      className="rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800"
                    >
                      + Novo
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className={`w-full border-collapse text-left text-[12px] ${role === "Administrador" ? "min-w-300" : "min-w-180"}`}>
                  <thead className="bg-slate-100 text-[9.6px] uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-medium">ID</th>
                      <th className="px-3 py-3 font-medium">Título</th>
                      <th className="px-3 py-3 font-medium">Solicitante</th>
                      <th className="px-3 py-3 font-medium">Departamento</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Responsável</th>
                      <th className="px-3 py-3 font-medium">Prioridade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map((ticket) => (
                        <tr key={ticket.id} className="border-t border-slate-200 text-slate-700 hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-[10.8px] text-sky-800">{ticket.id}</td>
                          <td className="max-w-72 truncate px-3 py-3">{ticket.title}</td>
                          <td className="whitespace-nowrap px-3 py-3">{ticket.requesterName ?? "Não informado"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-[10.8px] tracking-wider">{ticket.department ?? "Não informado"}</td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <span className={`rounded border px-2 py-1 text-[9.6px] font-semibold tracking-wider ${
                              ticket.status === "ABERTO" ? "border-sky-200 bg-sky-50 text-sky-700" :
                              ["RESOLVIDO", "SOLUCIONADO", "FECHADO"].includes(ticket.status) ? "border-emerald-300 bg-emerald-50 text-emerald-600" :
                              ticket.status === "EM ANDAMENTO" ? "border-amber-300 bg-amber-50 text-amber-600" :
                              "border-slate-300 bg-slate-100 text-slate-500"
                            }`}>
                              {ticket.status}
                            </span>
                          </td>
                          <td className="min-w-64 px-3 py-3">
                            {role === "Administrador" && !isHistory && !["FECHADO", "SOLUCIONADO", "RESOLVIDO"].includes(ticket.status) ? (
                              <div className="flex min-w-64 flex-col gap-2">
                                <select
                                  aria-label={`Atribuir ${ticket.id} a um resolutor`}
                                  value={assignmentDrafts[ticket.id]?.resolverId ?? ticket.assignedResolverId ?? ""}
                                  onChange={(event) => setAssignmentDrafts((current) => ({
                                    ...current,
                                    [ticket.id]: {
                                      resolverId: event.target.value,
                                      reason: current[ticket.id]?.reason ?? "",
                                    },
                                  }))}
                                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                                >
                                  <option value="">Sem responsável</option>
                                  {resolvers.map((resolver) => (
                                    <option key={resolver.id} value={resolver.id}>
                                      {resolver.nome} — {resolverAvailability(resolver)} · {openAssignmentCount(resolver.id)} chamados
                                    </option>
                                  ))}
                                </select>
                                <input
                                  aria-label={`Motivo da atribuição de ${ticket.id}`}
                                  value={assignmentDrafts[ticket.id]?.reason ?? ""}
                                  onChange={(event) => setAssignmentDrafts((current) => ({
                                    ...current,
                                    [ticket.id]: {
                                      resolverId: current[ticket.id]?.resolverId ?? ticket.assignedResolverId ?? "",
                                      reason: event.target.value,
                                    },
                                  }))}
                                  placeholder={ticket.assignedResolverId ? "Motivo da reatribuição" : "Motivo da atribuição"}
                                  className="rounded border border-slate-300 px-2 py-1.5 text-xs"
                                />
                                <button
                                  type="button"
                                  disabled={
                                    !assignmentDrafts[ticket.id]?.resolverId ||
                                    assignmentDrafts[ticket.id]?.resolverId === ticket.assignedResolverId ||
                                    !assignmentDrafts[ticket.id]?.reason?.trim()
                                  }
                                  onClick={() => submitAssignment(ticket)}
                                  className="rounded bg-sky-800 px-2 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {ticket.assignedResolverId ? "Reatribuir" : "Atribuir"}
                                </button>
                                {ticket.returnReason && <span className="text-[10.8px] text-amber-700">Devolvido: {ticket.returnReason}</span>}
                              </div>
                            ) : (
                              <span className="whitespace-nowrap text-slate-600">{ticket.responsible ?? "Não atribuído"}</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {role === "Administrador" && !isHistory && !["FECHADO", "SOLUCIONADO", "RESOLVIDO"].includes(ticket.status) ? (
                              <select
                                aria-label={`Prioridade de ${ticket.id}`}
                                value={ticket.priority}
                                onChange={(event) => updatePriority(ticket.id, event.target.value)}
                                className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                              >
                                {(settings.priorities ?? []).map((item) => <option key={item.name} value={item.name.toUpperCase()}>{item.name}</option>)}
                              </select>
                            ) : (
                              <span className={`text-[10.8px] font-semibold ${ticket.priority === "ALTA" || ticket.priority === "CRÍTICA" ? "text-amber-600" : "text-slate-500"}`}>
                                {ticket.priority}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <footer className="border-t border-slate-200 px-3 py-2 text-[10.8px] uppercase tracking-widest text-slate-500">
                {filteredTickets.length} chamados
              </footer>
            </section>
          )}
          {active === "Usuários" && (
            <section className="overflow-hidden border border-slate-300 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 p-3">
                <h1 className="text-base font-bold">
                  Gestão de Usuários <span className="ml-1 text-[10.8px] font-normal uppercase tracking-widest text-slate-500">{users.length} usuários</span>
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    aria-label="Buscar usuário"
                    placeholder="Buscar usuário..."
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    className="w-44 rounded border border-slate-300 px-3 py-2 text-xs"
                  />
                  <select
                    aria-label="Filtrar usuários por perfil"
                    value={userProfileFilter}
                    onChange={(event) => setUserProfileFilter(event.target.value)}
                    className="rounded border border-slate-300 bg-white px-2 py-2 text-xs"
                  >
                    <option>Todos os perfis</option>
                    {userProfiles.filter((profile) => profile !== "Supervisor").map((profile) => (
                      <option key={profile}>{profile}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setUserFormError("");
                      setShowNewUser(true);
                    }}
                    className="rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800"
                  >
                    + Novo Usuário
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-260 border-collapse text-left text-[12px]">
                  <thead className="bg-slate-100 text-[9.6px] uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-medium">Usuário</th>
                      <th className="px-3 py-3 font-medium">CPF</th>
                      <th className="px-3 py-3 font-medium">Departamento</th>
                      <th className="px-3 py-3 font-medium">Cargo</th>
                      <th className="px-3 py-3 font-medium">Perfil</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Último acesso</th>
                      <th className="px-3 py-3"><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((item) => {
                      const initials = item.nome
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase();
                      const profileTone = item.profile === "Resolutor"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : item.profile === "Administrador"
                          ? "border-slate-300 bg-slate-100 text-slate-700"
                          : "border-sky-200 bg-sky-50 text-sky-700";
                      const status = item.status ?? "ATIVO";

                      return (
                        <tr key={item.id ?? item.cpf} className="group border-t border-slate-200 text-slate-700 hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-700 text-[10.8px] font-bold text-white">{initials}</span>
                              <span className="min-w-0">
                                <strong className="block truncate font-medium">{item.nome}</strong>
                                <span className="block truncate text-[9.6px] uppercase tracking-wider text-slate-500">{item.email ?? "E-mail não informado"}</span>
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-[10.8px] text-slate-500">{item.cpf ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-3">{item.departamento ?? "Não informado"}</td>
                          <td className="whitespace-nowrap px-3 py-3">{item.cargo ?? "Não informado"}</td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <span className={`rounded border px-2 py-1 text-[9.6px] font-semibold uppercase tracking-wider ${profileTone}`}>{item.profile ?? "Sem perfil"}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <span className={`font-mono text-[9.6px] font-semibold uppercase tracking-wider ${status === "ATIVO" ? "text-emerald-600" : status === "BLOQUEADO" ? "text-red-600" : "text-slate-500"}`}>
                              ● {status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-[10.8px] text-slate-500">{item.ultimoAcesso ?? "—"}</td>
                          <td className="whitespace-nowrap px-2 py-2">
                            <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                              <button
                                type="button"
                                title="Editar"
                                aria-label={`Editar ${item.nome}`}
                                onClick={() => openUserEditor(item)}
                                className="relative rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-700"
                              >
                                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                title={status === "BLOQUEADO" ? "Desbloquear" : "Bloquear"}
                                aria-label={`${status === "BLOQUEADO" ? "Desbloquear" : "Bloquear"} ${item.nome}`}
                                onClick={() => toggleUserStatus(item)}
                                disabled={item.id === user?.id}
                                className="relative rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                  {status === "BLOQUEADO" ? <path d="M7 11V7a5 5 0 0 1 9.9-1" /> : <path d="M7 11V7a5 5 0 0 1 10 0v4" />}
                                  <rect x="5" y="11" width="14" height="10" rx="2" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-xs text-slate-500">Nenhum usuário encontrado.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <footer className="border-t border-slate-200 px-3 py-2 font-mono text-[9.6px] uppercase tracking-widest text-slate-500">
                {filteredUsers.length} de {users.length} usuários cadastrados
              </footer>

              {showNewUser && (
                <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4">
                  <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded border border-slate-300 bg-white shadow-xl">
                    <div className="border-b border-slate-200 px-5 py-4">
                      <h2 className="text-base font-bold">{editingUser ? "Editar usuário" : "Novo usuário"}</h2>
                    </div>
                    <form onSubmit={handleSaveUser} className="grid gap-3 p-5 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs text-slate-600 sm:col-span-2">
                        Nome completo
                        <input name="nome" defaultValue={editingUser?.nome ?? ""} required className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-800" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-slate-600">
                        CPF
                        <input
                          required
                          inputMode="numeric"
                          maxLength={14}
                          value={newUserCpf}
                          onChange={(event) => setNewUserCpf(formatCpf(event.target.value))}
                          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-800"
                          placeholder="000.000.000-00"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-slate-600">
                        E-mail
                        <input name="email" type="email" defaultValue={editingUser?.email ?? ""} required className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-800" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-slate-600">
                        Departamento
                        <input name="departamento" defaultValue={editingUser?.departamento ?? ""} required className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-800" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-slate-600">
                        Cargo
                        <input name="cargo" defaultValue={editingUser?.cargo ?? ""} required className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-800" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-slate-600">
                        Perfil
                        <select name="profile" defaultValue={editingUser?.profile ?? "Usuário Comum"} required className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                          {userProfiles.map((profile) => (
                            <option key={profile}>{profile}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-slate-600">
                        Senha inicial
                        <input name="senha" type="password" defaultValue={editingUser?.senha ?? ""} required minLength={6} className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-800" />
                      </label>
                      {userFormError && <p className="text-xs text-red-600 sm:col-span-2">{userFormError}</p>}
                      <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                        <button type="button" onClick={() => { setShowNewUser(false); setEditingUser(null); setNewUserCpf(""); }} className="rounded border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">Cancelar</button>
                        <button type="submit" className="rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800">{editingUser ? "Salvar alterações" : "Salvar usuário"}</button>
                      </div>
                    </form>
                  </section>
                </div>
              )}
            </section>
          )}
          {active === "Inventário" && (
            <section className="overflow-hidden border border-slate-300 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 p-3">
                <h1 className="text-base font-bold">
                  Inventário de Ativos <span className="ml-1 text-[10.8px] font-normal uppercase tracking-widest text-slate-500">{assets.length} ativos</span>
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    aria-label="Buscar ativo ou número de série"
                    placeholder="Buscar ativo ou N/S..."
                    value={assetSearch}
                    onChange={(event) => setAssetSearch(event.target.value)}
                    className="w-44 rounded border border-slate-300 px-3 py-2 text-xs"
                  />
                  <select
                    aria-label="Filtrar por tipo de ativo"
                    value={assetTypeFilter}
                    onChange={(event) => setAssetTypeFilter(event.target.value)}
                    className="rounded border border-slate-300 bg-white px-2 py-2 text-xs"
                  >
                    <option>Todos os tipos</option>
                    {[...new Set(assets.map((asset) => asset.tipo))].map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar por status do ativo"
                    value={assetStatusFilter}
                    onChange={(event) => setAssetStatusFilter(event.target.value)}
                    className="rounded border border-slate-300 bg-white px-2 py-2 text-xs"
                  >
                    <option>Todos os status</option>
                    {assetStatuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewAsset(true)}
                    className="rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800"
                  >
                    + Novo Ativo
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 border-b border-slate-300 sm:grid-cols-4">
                {assetStatuses.map((status) => {
                  const colors = {
                    ATIVO: "text-emerald-600",
                    "MANUTENÇÃO": "text-amber-600",
                    INATIVO: "text-slate-500",
                    DESCARTADO: "text-rose-600",
                  };
                  return (
                    <div key={status} className="flex items-center justify-center gap-2 border-r border-slate-200 px-3 py-2 text-[10.8px] font-mono uppercase tracking-widest last:border-r-0">
                      <span className={`text-[13.2px] ${colors[status]}`}>●</span>
                      <span className="text-slate-500">{status}</span>
                      <strong className={colors[status]}>{assets.filter((asset) => asset.status === status).length}</strong>
                    </div>
                  );
                })}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-280 border-collapse text-left text-[12px]">
                  <thead className="bg-slate-100 text-[9.6px] uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-medium">ID</th>
                      <th className="px-3 py-3 font-medium">Nome do ativo</th>
                      <th className="px-3 py-3 font-medium">Tipo</th>
                      <th className="px-3 py-3 font-medium">Marca / Modelo</th>
                      <th className="px-3 py-3 font-medium">N/S</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Responsável</th>
                      <th className="px-3 py-3 font-medium">Departamento</th>
                      <th className="px-3 py-3 font-medium">Aquisição</th>
                      <th className="px-3 py-3 text-center font-medium">Chamados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map((asset) => {
                      const statusColors = {
                        ATIVO: "text-emerald-600",
                        "MANUTENÇÃO": "text-amber-600",
                        INATIVO: "text-slate-500",
                        DESCARTADO: "text-rose-600",
                      };
                      return (
                        <tr key={asset.id} className="border-t border-slate-200 text-slate-700 hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-[10.8px] text-sky-800">{asset.id}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-medium">{asset.nome}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-[10.8px] text-slate-500">{asset.tipo}</td>
                          <td className="whitespace-nowrap px-3 py-3">{asset.marcaModelo}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-[10.8px] text-slate-500">{asset.numeroSerie}</td>
                          <td className={`whitespace-nowrap px-3 py-3 font-mono text-[10.8px] font-semibold tracking-wider ${statusColors[asset.status] ?? "text-slate-500"}`}>● {asset.status}</td>
                          <td className="whitespace-nowrap px-3 py-3">{asset.responsavel}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-[10.8px] text-slate-500">{asset.departamento}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-[10.8px] text-slate-500">{asset.aquisicao}</td>
                          <td className="px-3 py-3 text-center font-semibold">{asset.chamados || "—"}</td>
                        </tr>
                      );
                    })}
                    {filteredAssets.length === 0 && (
                      <tr><td colSpan={10} className="px-3 py-8 text-center text-xs text-slate-500">Nenhum ativo encontrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <footer className="border-t border-slate-200 px-3 py-2 font-mono text-[9.6px] uppercase tracking-widest text-slate-500">
                {filteredAssets.length} de {assets.length} ativos
              </footer>

              {showNewAsset && (
                <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4">
                  <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded border border-slate-300 bg-white shadow-xl">
                    <div className="border-b border-slate-200 px-5 py-4">
                      <h2 className="text-base font-bold">Novo ativo</h2>
                    </div>
                    <form onSubmit={handleCreateAsset} className="grid gap-3 p-5 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs text-slate-600">Nome do ativo<input name="nome" required className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-800" /></label>
                      <label className="flex flex-col gap-1 text-xs text-slate-600">Tipo<input name="tipo" required placeholder="Ex.: NOTEBOOK" className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-800" /></label>
                      <label className="flex flex-col gap-1 text-xs text-slate-600">Marca / Modelo<input name="marcaModelo" required className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-800" /></label>
                      <label className="flex flex-col gap-1 text-xs text-slate-600">Número de série<input name="numeroSerie" required className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-800" /></label>
                      <label className="flex flex-col gap-1 text-xs text-slate-600">Status<select name="status" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">{assetStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                      <label className="flex flex-col gap-1 text-xs text-slate-600">Responsável<input name="responsavel" required className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-800" /></label>
                      <label className="flex flex-col gap-1 text-xs text-slate-600">Departamento<input name="departamento" required className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-800" /></label>
                      <label className="flex flex-col gap-1 text-xs text-slate-600">Data de aquisição<input name="aquisicao" type="date" required className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-800" /></label>
                      <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                        <button type="button" onClick={() => setShowNewAsset(false)} className="rounded border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">Cancelar</button>
                        <button type="submit" className="rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800">Salvar ativo</button>
                      </div>
                    </form>
                  </section>
                </div>
              )}
            </section>
          )}
          {active === "Auditoria" && role === "Administrador" && (
            <AuditPanel auditLogs={auditLogs} />
          )}
          {active === "Relatórios" && role === "Administrador" && (
            <ReportsPanel tickets={tickets} users={users} assets={assets} settings={settings} />
          )}
          {active === "Configurações" && role === "Administrador" && (
            <SettingsPanel
              settings={settings}
              currentUser={user}
              onSaveSettings={onSaveSettings}
            />
          )}
          {active === "Abrir Chamado" && role !== "Resolutor" && (
            <AbrirChamado
              settings={settings}
              user={user}
              initialValues={ticketDraft ?? {}}
              onSubmit={onCreateTicket}
              onCancel={() => {
                setTicketDraft(null);
                setActive(role === "Resolutor" ? "Notificações" : "Dashboard");
              }}
            />
          )}
          {active === "Notificações" && (
            <NotificationsPanel
              tickets={tickets}
              auditLogs={auditLogs}
              pendingUsers={role === "Administrador" ? pendingUsers : []}
              user={user}
              role={role}
              initialSelectedId={role === "Resolutor" ? selectedResolverTicketId : null}
              onOpenTicket={role === "Resolutor" ? onOpenResolverTicket : undefined}
              onSavePreferences={onSavePreferences}
              onReply={onReplyToTicket}
              onResolve={onResolveTicket}
              onReturnTicket={onReturnTicket}
              onAssignProfile={assignPendingUser}
              onRejectRegistration={rejectPendingUser}
            />
          )}
          {active === "Meu Perfil" && (
            <ProfilePanel
              userName={userName}
              role={role}
              profileIcon={profileIcon}
              onIconChange={changeProfileIcon}
              user={user}
              settings={settings}
              onSaveProfile={onSaveProfile}
              onRequestPersonalChange={role === "Resolutor" ? undefined : () => {
                const categories = settings.categories?.filter((category) => category.active) ?? [];
                const priorities = settings.priorities ?? [];
                const category = categories.find((item) => item.name.toLowerCase() === "acesso") ?? categories[0];
                const priority = priorities.find((item) => item.name.toLowerCase() === "baixa") ?? priorities[0];
                const department = settings.departments?.find((item) =>
                  item.toLowerCase() === user.departamento?.toLowerCase()
                ) ?? "";
                setTicketDraft({
                  title: "Solicitação de alteração de dados pessoais",
                  category: category?.name ?? "",
                  priority: priority?.name ?? "",
                  department,
                  description: `Solicito a alteração dos meus dados cadastrais.\n\nNome: ${userName}\nE-mail atual: ${user.email ?? "Não informado"}\nSetor: ${user.departamento ?? "Não informado"}\nCargo: ${user.cargo ?? "Não informado"}\nTelefone atual: ${user.telefone ?? "Não informado"}\nLocal atual: ${user.local ?? "Não informado"}\n\nDados que desejo alterar e valores corretos:`,
                });
                setActive("Abrir Chamado");
              }}
              onSavePreferences={onSavePreferences}
              onChangePassword={onChangePassword}
            />
          )}
        </main>
      </div>
    </div>
  );
}
