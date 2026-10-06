import { useEffect, useState } from "react";
import AbrirChamado from "./AbrirChamado.jsx";
import defaultAvatar from "../assets/avatar-default.svg";

export function getTicketNotificationKey(ticket) {
  const latestResponse = ticket.responses?.[ticket.responses.length - 1];
  return `ticket:${ticket.id}:${ticket.updatedAt ?? ticket.assignedAt ?? ticket.date ?? ""}:${latestResponse?.id ?? ""}`;
}

export function getRegistrationNotificationKey(pendingUser) {
  return `registration:${pendingUser.id}:${pendingUser.createdAt ?? ""}`;
}

const menuItems = [
  { label: "Meus Chamados", icon: "▤" },
  { label: "Abrir Chamado", icon: "+" },
  { label: "Notificações", icon: "♧", divider: true },
  { label: "Meu Perfil", icon: "♙" },
];

export default function User({
  user,
  tickets = [],
  settings = {},
  onCreateTicket,
  onReplyToTicket,
  onResolveTicket,
  onSaveProfile,
  onSavePreferences,
  onChangePassword,
  onLogout,
}) {
  const [active, setActive] = useState("Meus Chamados");
  const [ticketTab, setTicketTab] = useState("ativos");
  const [ticketDraft, setTicketDraft] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(Boolean(user?.preferences?.appearance?.sidebarCollapsed));
  const [sidebarError, setSidebarError] = useState("");
  const [profileIcon, setProfileIcon] = useState(() => {
    const savedIcon = localStorage.getItem(`pixie-profile-icon-${user?.id ?? "default"}`)
      || localStorage.getItem("pixie-profile-icon") || "";
    return savedIcon.startsWith("data:image/") ? savedIcon : "";
  });
  useEffect(() => {
    setSidebarCollapsed(Boolean(user?.preferences?.appearance?.sidebarCollapsed));
  }, [user?.preferences?.appearance?.sidebarCollapsed]);
  const userName = user?.nome ?? "Colaborador";
  const initials = userName
    .split(" ")
    .slice(0, 2)
    .map((name) => name[0])
    .join("")
    .toUpperCase();
  const myTickets = tickets.filter((ticket) =>
    ticket.requesterId === user?.id || ticket.requesterName === userName
  );
  const displayedTickets = myTickets.filter((ticket) =>
    ticketTab === "ativos"
      ? !["SOLUCIONADO", "FECHADO", "RESOLVIDO"].includes(ticket.status)
      : ["SOLUCIONADO", "FECHADO", "RESOLVIDO"].includes(ticket.status)
  );
  const notificationCount = myTickets.filter((ticket) =>
    ticket.responses?.some((response) => response.authorProfile === "Resolutor")
  ).length;
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
        Offline · Banco local
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className={`flex shrink-0 flex-col border-r border-slate-300 bg-slate-200/70 transition-[width] ${sidebarCollapsed ? "w-14" : "w-48"}`}>
          <div className={`flex h-8 items-center border-b border-slate-300 px-2 text-lg text-sky-700 ${sidebarCollapsed ? "justify-center" : "justify-end"}`}>
            <button type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"} title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}>
              {sidebarCollapsed ? "›" : "‹"}
            </button>
          </div>
          <nav className="flex-1 p-2">
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setActive(item.label)}
                aria-label={sidebarCollapsed ? item.label : undefined}
                title={sidebarCollapsed ? item.label : undefined}
                className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-[13.2px] ${
                  item.divider ? "mt-3 border-t border-slate-300 pt-3" : ""
                } ${active === item.label ? "bg-white font-semibold text-sky-800 shadow-sm" : "text-slate-600 hover:bg-white/70"}`}
              >
                <span className="flex w-4 justify-center text-sm text-sky-700">
                  {item.icon}
                </span>
                {!sidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                {item.count && !sidebarCollapsed && (
                  <span className="rounded bg-slate-600 px-1.5 py-0.5 text-[10.8px] font-bold text-white">
                    {item.label === "Meus Chamados" ? myTickets.length : item.label === "Notificações" ? notificationCount : item.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="border-t border-slate-300 bg-slate-100/60 p-3">
            <div className="flex items-center gap-2 text-[12px]">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-700 font-bold text-white">
                {initials}
              </div>
              {!sidebarCollapsed && <div className="min-w-0">
                <strong className="block truncate">{userName}</strong>
                <span className="text-[9.6px] uppercase tracking-wider text-slate-500">
                  Usuário comum
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
          {active !== "Abrir Chamado" &&
            active !== "Notificações" &&
            active !== "Meu Perfil" && (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10.8px] uppercase tracking-widest text-sky-700">
                      Bem-vindo de volta
                    </p>
                    <h1 className="mt-1 text-xl font-bold">{userName}</h1>
                    <p className="mt-1 text-[10.8px] uppercase tracking-widest text-slate-500">
                      {new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).toUpperCase()} · BANCO LOCAL
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActive("Abrir Chamado")}
                    className="rounded bg-slate-800 px-3 py-2 text-[12px] font-semibold text-white hover:bg-sky-800"
                  >
                    ⊕ Abrir Chamado
                  </button>
                </div>

                <div className="mt-5 border-b border-slate-300">
                  <button
                    type="button"
                    onClick={() => setTicketTab("ativos")}
                    className={`px-1 pb-3 text-[13.2px] font-semibold ${ticketTab === "ativos" ? "border-b-2 border-sky-800 text-sky-800" : "text-slate-500"}`}
                  >
                    Chamados Ativos{" "}
                    <span className="ml-1 rounded bg-slate-600 px-1.5 py-0.5 text-[10.8px] text-white">
                      {myTickets.filter((ticket) => !["SOLUCIONADO", "FECHADO"].includes(ticket.status)).length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTicketTab("resolvidos")}
                    className={`ml-5 pb-3 text-[13.2px] ${ticketTab === "resolvidos" ? "border-b-2 border-sky-800 font-semibold text-sky-800" : "text-sky-700"}`}
                  >
                    Resolvidos / Fechados
                  </button>
                </div>

                <section className="mt-4">
                  {displayedTickets.map((ticket) => (
                    <article
                      key={ticket.id}
                      className="rounded border border-slate-300 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-[10.8px] uppercase tracking-widest text-slate-500">
                            {ticket.id} · {ticket.category}
                          </p>
                          <h2 className="mt-1 text-sm font-semibold">
                            {ticket.title}
                          </h2>
                        </div>
                        <span className="text-slate-300">›</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 text-[10.8px] uppercase tracking-wider">
                        <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-600">
                          {ticket.status}
                        </span>
                        <span className="text-amber-600">
                          {ticket.priority}
                        </span>
                        <span className="text-slate-400">
                          · Responsável: {ticket.responsible}
                        </span>
                        <span className="ml-auto text-slate-500">
                          {ticket.date}
                        </span>
                      </div>
                      <p className="mt-3 text-[10.8px] font-semibold uppercase tracking-widest text-amber-600">
                        ● SLA: {ticket.sla}
                      </p>
                      {ticket.responses?.length > 0 && (
                        <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
                          <strong>Resposta do Resolutor:</strong> {ticket.responses[ticket.responses.length - 1].text}
                        </p>
                      )}
                    </article>
                  ))}
                  {displayedTickets.length === 0 && (
                    <p className="rounded border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
                      Nenhum chamado nesta categoria.
                    </p>
                  )}
                </section>

                <footer className="mt-8 flex justify-between border-t border-slate-300 pt-3 font-mono text-[9.6px] uppercase tracking-widest text-slate-400">
                  <span>{myTickets.length} chamados registrados</span>
                  <span>Dados locais · WG Chamados</span>
                </footer>
              </div>
            )}
          {active === "Abrir Chamado" && (
            <AbrirChamado
              settings={settings}
              user={user}
              initialValues={ticketDraft ?? {}}
              onSubmit={onCreateTicket}
              onCancel={() => {
                setTicketDraft(null);
                setActive("Meus Chamados");
              }}
            />
          )}
          {active === "Notificações" && (
            <NotificationsPanel
              tickets={tickets}
              user={user}
              role="Usuário Comum"
              onReply={onReplyToTicket}
              onResolve={onResolveTicket}
            />
          )}
          {active === "Meu Perfil" && (
            <ProfilePanel
              userName={userName}
              profileIcon={profileIcon}
              onIconChange={changeProfileIcon}
              user={user}
              settings={settings}
              onSaveProfile={onSaveProfile}
              onRequestPersonalChange={() => {
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

function profileDate(value) {
  if (!value) return "Não informado";
  const date = new Date(typeof value === "string" && value.includes(" ") && !value.includes("T")
    ? value.replace(" ", "T")
    : value);
  return Number.isNaN(date.getTime()) ? "Não informado" : date.toLocaleString("pt-BR");
}

function ProfileSection({ title, subtitle, children }) {
  return (
    <section className="mt-4 rounded border border-slate-300 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-emerald-800">{title}</h2>
        {subtitle && <p className="mt-1 text-[12px] text-slate-500">{subtitle}</p>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ProfileInput({ label, value, onChange, readOnly = false, required = false, type = "text" }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] font-medium text-slate-600">
      {label}
      <input
        type={type}
        value={value ?? ""}
        onChange={onChange}
        readOnly={readOnly}
        required={required}
        className={`rounded border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-700 ${readOnly ? "bg-slate-100 text-slate-500" : "bg-white"}`}
      />
    </label>
  );
}

export function ProfilePanel({
  userName,
  role = "Usuário comum",
  profileIcon,
  onIconChange,
  user = {},
  settings = {},
  onSaveProfile,
  onRequestPersonalChange,
  onSavePreferences,
  onChangePassword,
}) {
  const [personal, setPersonal] = useState({
    email: user.email ?? "",
    telefone: user.telefone ?? "",
    local: user.local ?? "",
  });
  const [appearance, setAppearance] = useState({
    theme: user.preferences?.appearance?.theme ?? "light",
    fontSize: user.preferences?.appearance?.fontSize ?? "medium",
    sidebarCollapsed: Boolean(user.preferences?.appearance?.sidebarCollapsed),
  });
  const [notifications, setNotifications] = useState({
    events: {
      ticketReplied: user.preferences?.notifications?.events?.ticketReplied ?? true,
      ticketResolved: user.preferences?.notifications?.events?.ticketResolved ?? true,
      ticketAssigned: user.preferences?.notifications?.events?.ticketAssigned ?? true,
    },
    sound: user.preferences?.notifications?.sound ?? true,
    desktop: user.preferences?.notifications?.desktop ?? true,
  });
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [messages, setMessages] = useState({});
  const minPasswordLength = Number(settings.security?.minimumPasswordLength) || 8;
  const requiresAdminRequest = ["Resolutor", "Usuário Comum", "Usuário comum"].includes(role);
  const canEditPersonalData = !requiresAdminRequest;
  const canRequestPersonalChange = role !== "Resolutor" && Boolean(onRequestPersonalChange);

  useEffect(() => {
    setPersonal({ email: user.email ?? "", telefone: user.telefone ?? "", local: user.local ?? "" });
    setAppearance({
      theme: user.preferences?.appearance?.theme ?? "light",
      fontSize: user.preferences?.appearance?.fontSize ?? "medium",
      sidebarCollapsed: Boolean(user.preferences?.appearance?.sidebarCollapsed),
    });
    setNotifications({
      events: {
        ticketReplied: user.preferences?.notifications?.events?.ticketReplied ?? true,
        ticketResolved: user.preferences?.notifications?.events?.ticketResolved ?? true,
        ticketAssigned: user.preferences?.notifications?.events?.ticketAssigned ?? true,
      },
      sound: user.preferences?.notifications?.sound ?? true,
      desktop: user.preferences?.notifications?.desktop ?? true,
    });
  }, [user]);

  async function saveSection(section, action) {
    setMessages((previous) => ({ ...previous, [section]: "" }));
    try {
      await action();
      setMessages((previous) => ({ ...previous, [section]: "Salvo." }));
    } catch (error) {
      console.error(`Erro ao salvar ${section} do perfil:`, error);
      setMessages((previous) => ({ ...previous, [section]: "Não foi possível salvar. Tente novamente." }));
    }
  }

  async function submitPassword(event) {
    event.preventDefault();
    if (password.newPassword !== password.confirmPassword) {
      setMessages((previous) => ({ ...previous, password: "A confirmação não corresponde à nova senha." }));
      return;
    }
    if (password.newPassword.length < minPasswordLength) {
      setMessages((previous) => ({ ...previous, password: `Use pelo menos ${minPasswordLength} caracteres.` }));
      return;
    }
    try {
      const result = await onChangePassword?.(password);
      if (result) {
        setMessages((previous) => ({ ...previous, password: result }));
        return;
      }
      setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setMessages((previous) => ({ ...previous, password: "Senha alterada." }));
    } catch (error) {
      console.error("Erro ao alterar senha:", error);
      setMessages((previous) => ({ ...previous, password: "Não foi possível alterar a senha. Tente novamente." }));
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-[10.8px] uppercase tracking-widest text-sky-700">
            Área pessoal / Meu perfil
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-800">
            Meu Perfil.
          </h1>
          <p className="text-xs text-slate-500">
            Um pequeno cuidado para dar grandes coisas crescerem.
          </p>
        </div>
        <span className="rounded border border-slate-300 bg-white px-3 py-2 text-[12px] text-slate-500">
          {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
        </span>
      </div>

      <section className="overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
        <div className="flex justify-between border-b border-slate-200 px-4 py-3 text-[10.8px] uppercase tracking-widest text-slate-500">
          <span className="text-emerald-600">● Seu espaço</span>
          <span>Perfil / Jardim</span>
        </div>

        <div className="px-5 py-5 text-center sm:px-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-white bg-sky-900 text-2xl font-bold text-white shadow-lg">
            <img
              src={profileIcon || defaultAvatar}
              alt={`Foto de ${userName}`}
              className="h-full w-full rounded-full object-cover"
            />
          </div>
          <h2 className="mt-3 text-base font-bold text-slate-800">
            {userName}
          </h2>
          <p className="text-[10.8px] uppercase tracking-widest text-slate-500">
            {role}
          </p>

          <label
            htmlFor="profile-icon"
            className="mt-3 inline-block cursor-pointer rounded border border-slate-300 bg-white px-3 py-2 text-xs text-sky-700 hover:bg-slate-50"
          >
            Trocar ícone
          </label>
          <input
            id="profile-icon"
            type="file"
            accept="image/*"
            onChange={onIconChange}
            className="hidden"
          />
        </div>
      </section>

      {(user.mustChangePassword || user.passwordChangeRequired) && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Sua senha ainda é a senha inicial gerada pelo administrador. Troque-a para proteger sua conta.
        </p>
      )}

      <ProfileSection
        title="Dados pessoais"
        subtitle={canEditPersonalData
          ? "Nome, setor e cargo são atualizados pela administração."
          : role === "Resolutor"
            ? "Nome, setor e cargo são atualizados pela administração. Fale com o administrador para solicitar alterações."
            : "Para alterar seus dados cadastrais, solicite a mudança ao administrador abrindo um chamado."}
      >
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEditPersonalData) return;
            saveSection("personal", () => onSaveProfile?.(personal));
          }}
        >
          <ProfileInput label="Nome completo" value={userName} readOnly />
          <ProfileInput label="E-mail" type="email" value={personal.email} readOnly={!canEditPersonalData} onChange={(event) => setPersonal({ ...personal, email: event.target.value })} />
          <ProfileInput label="Setor" value={user.departamento} readOnly />
          <ProfileInput label="Cargo" value={user.cargo} readOnly />
          <ProfileInput label="Ramal ou telefone" value={personal.telefone} readOnly={!canEditPersonalData} onChange={(event) => setPersonal({ ...personal, telefone: event.target.value })} />
          <ProfileInput label="Local (sala)" value={personal.local} readOnly={!canEditPersonalData} onChange={(event) => setPersonal({ ...personal, local: event.target.value })} />
          <div className="flex items-center gap-3 sm:col-span-2">
            {canEditPersonalData ? (
              <>
                <button type="submit" className="rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800">Salvar alterações</button>
                <span role="status" className="text-xs text-emerald-700">{messages.personal}</span>
              </>
            ) : (
              canRequestPersonalChange
                ? (
                  <button
                    type="button"
                    onClick={onRequestPersonalChange}
                    className="rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800"
                  >
                    Solicitar alteração ao administrador
                  </button>
                )
                : <p className="text-xs text-slate-500">Solicite atualizações diretamente ao administrador.</p>
            )}
          </div>
        </form>
      </ProfileSection>

      <ProfileSection title="Cuidar da segurança" subtitle={`A senha precisa ter pelo menos ${minPasswordLength} caracteres.`}>
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={submitPassword}>
          <ProfileInput label="Senha atual" type="password" required value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} />
          <ProfileInput label="Nova senha" type="password" required value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} />
          <ProfileInput label="Confirmar nova senha" type="password" required value={password.confirmPassword} onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })} />
          <div className="flex items-center gap-3 sm:col-span-3">
            <button type="submit" className="rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800">Trocar senha</button>
            <span role="status" className="text-xs text-emerald-700">{messages.password}</span>
          </div>
        </form>
      </ProfileSection>

      <ProfileSection title="Deixar o jardim com a sua cara" subtitle="As preferências são salvas somente nesta conta.">
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const preferences = {
              ...(user.preferences ?? {}),
              appearance,
            };
            saveSection("appearance", () => onSavePreferences?.(preferences));
          }}
        >
          <label className="flex flex-col gap-1 text-[12px] text-slate-600">Tema
            <select value={appearance.theme} onChange={(event) => setAppearance({ ...appearance, theme: event.target.value })} className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800">
              <option value="light">Claro</option><option value="dark">Escuro</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-slate-600">Tamanho da fonte
            <select value={appearance.fontSize} onChange={(event) => setAppearance({ ...appearance, fontSize: event.target.value })} className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800">
              <option value="small">Pequena</option><option value="medium">Média</option><option value="large">Grande</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[12px] text-slate-600">
            <input type="checkbox" checked={appearance.sidebarCollapsed} onChange={(event) => setAppearance({ ...appearance, sidebarCollapsed: event.target.checked })} className="accent-sky-800" />
            Iniciar com o menu lateral recolhido
          </label>
          <div className="flex items-center gap-3 sm:col-span-3">
            <button type="submit" className="rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800">Salvar alterações</button>
            <span role="status" className="text-xs text-emerald-700">{messages.appearance}</span>
          </div>
        </form>
      </ProfileSection>

      <ProfileSection title="Notificações que florescem" subtitle="Escolha os avisos que deseja receber.">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const preferences = {
              ...(user.preferences ?? {}),
              notifications: {
                ...user.preferences?.notifications,
                ...notifications,
              },
            };
            saveSection("notifications", () => onSavePreferences?.(preferences));
          }}
        >
          <PreferenceCheck label="Chamado respondido" checked={notifications.events.ticketReplied} onChange={(checked) => setNotifications({ ...notifications, events: { ...notifications.events, ticketReplied: checked } })} />
          <PreferenceCheck label="Chamado resolvido" checked={notifications.events.ticketResolved} onChange={(checked) => setNotifications({ ...notifications, events: { ...notifications.events, ticketResolved: checked } })} />
          <PreferenceCheck label="Chamado atribuído a mim" checked={notifications.events.ticketAssigned} onChange={(checked) => setNotifications({ ...notifications, events: { ...notifications.events, ticketAssigned: checked } })} />
          <PreferenceCheck label="Som de aviso" checked={notifications.sound} onChange={(checked) => setNotifications({ ...notifications, sound: checked })} />
          <PreferenceCheck label="Notificação nativa do Windows" checked={notifications.desktop} onChange={(checked) => setNotifications({ ...notifications, desktop: checked })} />
          <div className="flex items-center gap-3 sm:col-span-2">
            <button type="submit" className="rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800">Salvar alterações</button>
            <span role="status" className="text-xs text-emerald-700">{messages.notifications}</span>
          </div>
        </form>
      </ProfileSection>

      <ProfileSection title="Raízes da sua conta">
        <dl className="grid gap-3 text-xs sm:grid-cols-3">
          <div><dt className="text-slate-500">Conta criada em</dt><dd className="mt-1 font-medium text-slate-800">{profileDate(user.createdAt)}</dd></div>
          <div><dt className="text-slate-500">Último acesso</dt><dd className="mt-1 font-medium text-slate-800">{profileDate(user.lastLoginAt ?? user.ultimoAcesso)}</dd></div>
          <div><dt className="text-slate-500">Perfil de acesso</dt><dd className="mt-1 font-medium text-slate-800">{user.profile ?? role}</dd></div>
        </dl>
      </ProfileSection>
    </div>
  );
}

function PreferenceCheck({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-sky-800" />
      {label}
    </label>
  );
}

export function NotificationsPanel({
  tickets = [],
  auditLogs = [],
  pendingUsers = [],
  user,
  role = "Usuário Comum",
  initialSelectedId = null,
  onOpenTicket,
  onSavePreferences,
  onReply,
  onResolve,
  onReturnTicket,
  onAssignProfile,
  onRejectRegistration,
}) {
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [reply, setReply] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const visibleTickets = tickets
    .filter((ticket) => {
      if (role === "Administrador" || role === "Supervisor") return true;
      if (role === "Resolutor") return ticket.assignedResolverId === user?.id && !["SOLUCIONADO", "FECHADO", "RESOLVIDO"].includes(ticket.status);
      return ticket.requesterId === user?.id || ticket.requesterName === user?.nome;
    })
    .sort((first, second) =>
      (second.updatedAt ?? second.date ?? "").localeCompare(first.updatedAt ?? first.date ?? "")
    );
  const ticketNotifications = visibleTickets.map((ticket) => {
    const latest = ticket.responses?.[ticket.responses.length - 1];
    return {
      type: "ticket",
      key: `ticket:${ticket.id}`,
      readKey: getTicketNotificationKey(ticket),
      id: ticket.id,
      title: ticket.title,
      time: ticket.assignedAt ?? ticket.updatedAt ?? ticket.date,
      preview: role === "Administrador" && ticket.unassignedAlertedAt
        ? "Alerta: sem responsável há pelo menos 30 minutos"
        : latest
        ? `${latest.authorName}: ${latest.text}`
        : role === "Resolutor" && ticket.assignedAt
          ? "Chamado atribuído a você pela administração"
        : role === "Administrador" && !ticket.assignedResolverId
          ? `Novo chamado sem responsável · ${ticket.requesterName ?? "usuário"}`
          : `Novo chamado aberto por ${ticket.requesterName ?? "usuário"}`,
      ticket,
    };
  });
  const registrationNotifications = role === "Administrador"
    ? pendingUsers.map((pendingUser) => ({
        type: "registration",
        key: `registration:${pendingUser.id}`,
        readKey: getRegistrationNotificationKey(pendingUser),
        id: "Novo cadastro",
        title: pendingUser.nome,
        time: pendingUser.createdAt ?? "Agora",
        preview: "Novo usuário aguarda definição de perfil",
        pendingUser,
      }))
    : [];
  const adminAlertNotifications = role === "Administrador"
    ? auditLogs
      .filter((entry) => ["UNASSIGNED_TICKET_ALERT", "RESOLVER_ABSENT_WITH_OPEN_TICKETS", "TICKET_RETURNED"].includes(entry.action))
      .map((entry) => ({
        type: "audit",
        key: `audit:${entry.id}`,
        id: entry.ticketId ?? "Alerta",
        title: entry.description,
        time: entry.createdAt,
        preview: `${entry.actorName ?? "Sistema"} · ${entry.action}`,
        entry,
      }))
    : [];
  const notifications = [...registrationNotifications, ...adminAlertNotifications, ...ticketNotifications]
    .sort((first, second) => Date.parse(second.time) - Date.parse(first.time));
  const selectedNotification = notifications.find((item) => item.key === selectedId) ?? notifications[0];
  const selected = selectedNotification?.ticket;
  const latestResponse = selected?.responses?.[selected.responses.length - 1];
  const resolverHasReplied = selected?.responses?.some((response) =>
    response.authorId === user?.id && response.authorProfile === "Resolutor"
  );
  useEffect(() => {
    if (!selectedNotification) return;
    const canMarkAsRead = selectedNotification.type === "ticket" || selectedNotification.type === "registration";
    const readIds = Array.isArray(user?.preferences?.notifications?.readNotificationIds)
      ? user.preferences.notifications.readNotificationIds
      : [];
    const needsSavingReadState = canMarkAsRead &&
      !readIds.includes(selectedNotification.readKey) &&
      Boolean(onSavePreferences);

    if (needsSavingReadState) {
      onSavePreferences({
        ...(user?.preferences ?? {}),
        notifications: {
          ...user?.preferences?.notifications,
          readNotificationIds: [...readIds, selectedNotification.readKey],
        },
      }).catch((error) => {
        console.error("Erro ao marcar notificação como visualizada:", error);
        window.alert(error.message || "Não foi possível marcar a notificação como visualizada.");
      });
    }

    if (role === "Resolutor" && selectedNotification.type === "ticket" && onOpenTicket) {
      onOpenTicket(selectedNotification.ticket.id).catch((error) => {
        console.error("Erro ao marcar chamado como visualizado:", error);
        window.alert(error.message || "Não foi possível marcar o chamado como visualizado.");
      });
    }
  }, [role, selectedNotification?.key, selectedNotification?.readKey, onOpenTicket, onSavePreferences, user?.id, user?.preferences]);
  const statusTone = selected?.status === "ABERTO"
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : selected?.status === "SOLUCIONADO" || selected?.status === "FECHADO"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-amber-300 bg-amber-50 text-amber-600";

  return (
    <section className="flex min-h-full min-w-0 flex-col overflow-hidden rounded border border-slate-300 bg-white shadow-sm lg:flex-row">
      <div className="w-full shrink-0 border-b border-slate-300 bg-slate-100 lg:w-64 lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-300 px-4 py-3">
          <h1 className="text-base font-bold">Notificações</h1>
          <p className="mt-1 text-[12px] uppercase tracking-widest text-slate-500">
            Chamados, respostas e novos cadastros
          </p>
        </div>
        <div className="max-h-64 overflow-y-auto lg:max-h-none">
          {notifications.map((notification) => {
            const initials = (notification.type === "registration"
              ? notification.pendingUser.nome
              : notification.type === "audit"
                ? "!"
                : notification.ticket.requesterName ?? "CH")
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase();
            return (
              <button
                key={notification.key}
                type="button"
                onClick={() => {
                  setSelectedId(notification.key);
                  setReply("");
                  setReturnReason("");
                }}
                className={`flex w-full gap-3 border-b border-slate-300 px-4 py-3 text-left ${selectedNotification?.key === notification.key ? "bg-white shadow-inner" : "hover:bg-slate-200/60"}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-800 text-[12px] font-bold text-white">
                  {initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <strong className="truncate text-xs">{notification.id}</strong>
                    <small className="shrink-0 text-[10.8px] text-slate-500">{notification.time}</small>
                  </span>
                  <span className="mt-1 block truncate text-[13.2px] text-slate-700">{notification.title}</span>
                  <span className="mt-1 block truncate text-[12px] text-slate-500">{notification.preview}</span>
                </span>
              </button>
            );
          })}
          {notifications.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-slate-500">Nenhuma notificação.</p>
          )}
        </div>
      </div>

      {selectedNotification?.type === "audit" ? (
        <div className="min-w-0 flex-1 bg-slate-50 p-4 sm:p-6">
          <p className="font-mono text-[12px] uppercase tracking-widest text-amber-700">
            {selectedNotification.id} · Alerta administrativo
          </p>
          <h2 className="mt-2 text-base font-bold text-slate-800">{selectedNotification.title}</h2>
          <p className="mt-3 text-xs text-slate-600">
            {selectedNotification.entry.actorName ?? "Sistema"} · {new Date(selectedNotification.time).toLocaleString("pt-BR")}
          </p>
        </div>
      ) : selectedNotification?.type === "registration" ? (
        <NewRegistrationDetails
          pendingUser={selectedNotification.pendingUser}
          onAssignProfile={onAssignProfile}
          onRejectRegistration={onRejectRegistration}
        />
      ) : selected ? (
        <div className="min-w-0 flex-1 bg-slate-50 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 border-b border-slate-300 pb-4">
            <div>
              <p className="font-mono text-[12px] uppercase tracking-widest text-slate-500">
                {selected.id} · {selected.category}
              </p>
              <h2 className="mt-1 text-base font-bold text-slate-800">{selected.title}</h2>
              <p className="mt-1 text-[12px] uppercase tracking-wider text-slate-500">
                Solicitante: {selected.requesterName ?? "Não informado"} · {selected.date}
              </p>
            </div>
            <span className={`rounded border px-2 py-1 text-[12px] font-semibold tracking-wider ${statusTone}`}>
              {selected.status}
            </span>
          </div>

          <div className="mt-4 grid gap-5 xl:grid-cols-2">
            <div className="space-y-3">
              <ReadOnlyField label="Título do chamado" value={selected.title} />
              <div className="grid gap-3 sm:grid-cols-2">
                <ReadOnlyField label="Categoria" value={selected.category} />
                <ReadOnlyField label="Prioridade" value={selected.priority} />
                <ReadOnlyField label="Departamento" value={selected.department ?? "Não informado"} />
                <ReadOnlyField label="Ativo vinculado" value={selected.assetId || "Não informado"} />
                <ReadOnlyField label="Responsável" value={selected.responsible ?? "Não atribuído"} />
                {selected.returnReason && <ReadOnlyField label="Motivo da devolução anterior" value={selected.returnReason} />}
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-sky-800">
                  Descrição detalhada
                </label>
                <textarea
                  readOnly
                  value={selected.description ?? "Descrição não informada."}
                  rows="5"
                  className="w-full resize-none rounded border border-slate-300 bg-white px-3 py-2 text-[14.4px] text-slate-700 outline-none"
                />
              </div>
            </div>

            <div className="flex min-h-72 flex-col rounded border border-slate-300 bg-white">
              <h3 className="border-b border-slate-200 px-4 py-3 text-[12px] font-semibold uppercase tracking-widest text-sky-800">
                Respostas do chamado
              </h3>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {selected.responses?.map((response) => (
                  <article key={response.id} className="rounded border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <strong>{response.authorName} · {response.authorProfile}</strong>
                      <span className="shrink-0 text-slate-500">{response.date}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{response.text}</p>
                  </article>
                ))}
                {!selected.responses?.length && (
                  <p className="py-8 text-center text-xs text-slate-500">Aguardando resposta do Resolutor.</p>
                )}
              </div>
              {role === "Resolutor" && onReply && !["FECHADO", "SOLUCIONADO", "RESOLVIDO"].includes(selected.status) && (
                <form
                  className="border-t border-slate-200 p-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const message = reply.trim();
                    if (!message) return;
                    await onReply(selected.id, message);
                    setReply("");
                  }}
                >
                  <label htmlFor="resolver-reply" className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-sky-800">Responder ao chamado</label>
                  <textarea
                    id="resolver-reply"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    rows="3"
                    required
                    placeholder="Digite a atualização para o solicitante..."
                    className="w-full resize-y rounded border border-slate-300 px-3 py-2 text-xs outline-none focus:border-sky-700"
                  />
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    {onResolve && (
                      <button
                        type="button"
                        disabled={!resolverHasReplied}
                        onClick={() => onResolve(selected.id)}
                        title={resolverHasReplied ? undefined : "Envie uma resposta antes de solucionar o chamado."}
                        className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Solucionar chamado
                      </button>
                    )}
                    <button type="submit" className="rounded bg-slate-800 px-3 py-2 text-[12px] font-semibold text-white hover:bg-sky-800">Enviar resposta</button>
                  </div>
                </form>
              )}
              {role === "Resolutor" && onReturnTicket && selected.assignedResolverId === user?.id && !["FECHADO", "SOLUCIONADO", "RESOLVIDO"].includes(selected.status) && (
                <form
                  className="border-t border-slate-200 p-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const reason = returnReason.trim();
                    if (!reason) return;
                    try {
                      await onReturnTicket(selected.id, reason);
                      setReturnReason("");
                    } catch (error) {
                      console.error("Erro ao devolver chamado:", error);
                      window.alert(error.message || "Não foi possível devolver o chamado.");
                    }
                  }}
                >
                  <label htmlFor="return-ticket-reason" className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-amber-800">
                    Devolver ao admin
                  </label>
                  <textarea
                    id="return-ticket-reason"
                    value={returnReason}
                    onChange={(event) => setReturnReason(event.target.value)}
                    rows="2"
                    required
                    minLength={5}
                    placeholder="Explique por que não pode atender este chamado..."
                    className="w-full resize-y rounded border border-slate-300 px-3 py-2 text-xs outline-none focus:border-amber-700"
                  />
                  <div className="mt-2 flex justify-end">
                    <button type="submit" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800 hover:bg-amber-100">
                      Devolver ao admin
                    </button>
                  </div>
                </form>
              )}
              {role !== "Resolutor" && latestResponse && (
                <p className="border-t border-slate-200 px-4 py-2 text-[10.8px] uppercase tracking-wider text-slate-500">
                  Última resposta: {latestResponse.authorName} · {latestResponse.date}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-72 flex-1 items-center justify-center bg-slate-50 p-6 text-center text-xs text-slate-500">
          Selecione um chamado para ver detalhes e respostas.
        </div>
      )}
    </section>
  );
}

function NewRegistrationDetails({ pendingUser, onAssignProfile, onRejectRegistration }) {
  const [generatedPassword, setGeneratedPassword] = useState("");

  function generateInitialPassword() {
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    const randomValues = new Uint8Array(12);
    globalThis.crypto.getRandomValues(randomValues);
    setGeneratedPassword(
      Array.from(randomValues, (value) => characters[value % characters.length]).join(""),
    );
  }

  return (
    <div className="min-w-0 flex-1 bg-slate-50 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-300 pb-4">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-widest text-slate-500">Solicitação de acesso</p>
          <h2 className="mt-1 text-base font-bold text-slate-800">Novo cadastro</h2>
          <p className="mt-1 text-[12px] uppercase tracking-wider text-slate-500">Recebido em {pendingUser.createdAt ?? "data não informada"}</p>
        </div>
        <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] font-semibold tracking-wider text-amber-700">PENDENTE</span>
      </div>

      <section className="mt-5 max-w-2xl border border-slate-300 bg-white">
        <h3 className="border-b border-slate-200 px-4 py-3 text-[12px] font-semibold uppercase tracking-widest text-sky-800">Dados informados no cadastro</h3>
        <dl className="grid gap-x-6 sm:grid-cols-2">
          <div className="border-b border-slate-100 px-4 py-3">
            <dt className="text-[10.8px] uppercase tracking-wider text-slate-500">Nome completo</dt>
            <dd className="mt-1 text-sm text-slate-800">{pendingUser.nome}</dd>
          </div>
          <div className="border-b border-slate-100 px-4 py-3">
            <dt className="text-[10.8px] uppercase tracking-wider text-slate-500">CPF</dt>
            <dd className="mt-1 font-mono text-sm text-slate-800">{pendingUser.cpf}</dd>
          </div>
          <div className="border-b border-slate-100 px-4 py-3 sm:col-span-2">
            <dt className="text-[10.8px] uppercase tracking-wider text-slate-500">E-mail</dt>
            <dd className="mt-1 text-sm text-slate-800">{pendingUser.email}</dd>
          </div>
          <div className="border-b border-slate-100 px-4 py-3">
            <dt className="text-[10.8px] uppercase tracking-wider text-slate-500">Setor</dt>
            <dd className="mt-1 text-sm text-slate-800">{pendingUser.departamento}</dd>
          </div>
          <div className="border-b border-slate-100 px-4 py-3">
            <dt className="text-[10.8px] uppercase tracking-wider text-slate-500">Cargo</dt>
            <dd className="mt-1 text-sm text-slate-800">{pendingUser.cargo}</dd>
          </div>
          <div className="border-b border-slate-100 px-4 py-3 sm:col-span-2">
            <dt className="text-[10.8px] uppercase tracking-wider text-slate-500">Data de aniversário</dt>
            <dd className="mt-1 text-sm text-slate-800">{pendingUser.dataAniversario}</dd>
          </div>
        </dl>
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-600">Gere a senha inicial e defina o perfil de acesso</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              aria-label="Senha inicial gerada pelo administrador"
              value={generatedPassword}
              onChange={(event) => setGeneratedPassword(event.target.value)}
              placeholder="Digite ou gere uma senha inicial"
              className="min-w-48 flex-1 rounded border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800"
            />
            <button type="button" onClick={generateInitialPassword} className="rounded border border-slate-300 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-100">Gerar senha</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={!generatedPassword} onClick={() => onAssignProfile?.(pendingUser, "Administrador", generatedPassword)} className="rounded border border-slate-300 bg-slate-100 px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-slate-800 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50">Administrador</button>
            <button type="button" disabled={!generatedPassword} onClick={() => onAssignProfile?.(pendingUser, "Usuário Comum", generatedPassword)} className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50">Usuário Comum</button>
            <button type="button" disabled={!generatedPassword} onClick={() => onAssignProfile?.(pendingUser, "Resolutor", generatedPassword)} className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">Resolutor</button>
            <button type="button" onClick={() => {
              if (window.confirm(`Recusar o cadastro de ${pendingUser.nome}?`)) onRejectRegistration?.(pendingUser);
            }} className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-rose-800 hover:bg-rose-100">Recusar cadastro</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReadOnlyField({ label, value, placeholder }) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-sky-800">
        {label}{" "}
        {label === "Título do chamado" && (
          <span className="text-red-500">*</span>
        )}
      </label>
      <input
        readOnly
        value={value}
        placeholder={placeholder}
        className="w-full rounded border border-slate-300 bg-white px-2 py-2 text-[14.4px] text-slate-700 outline-none"
      />
    </div>
  );
}
