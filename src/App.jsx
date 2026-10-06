import { useEffect, useState } from "react";
import Login from "./screens/Login.jsx";
import Cadastro from "./screens/Cad.jsx";
import AdminDashboard from "./screens/Adm.jsx";
import Resolutor from "./screens/Resolutor.jsx";
import UserDashboard from "./screens/User.jsx";
import { buildDefaultDatabase, loadLocalDatabase, saveLocalDatabase } from "./lib/db.js";

const LOCAL_DATA_RESET_VERSION = 2;

async function notifyUser(targetUser, event, title, body) {
  if (!targetUser) return;
  const preferences = targetUser?.preferences?.notifications ?? {};
  if (preferences.events?.[event] === false) return;

  if (preferences.desktop !== false && window.electronAPI?.showNotification) {
    try {
      await window.electronAPI.showNotification(title, body);
    } catch (error) {
      console.error("Erro ao exibir notificação nativa:", error);
      window.alert("O aviso foi registrado, mas não foi possível exibir a notificação do sistema.");
    }
  }

  if (preferences.sound !== false && typeof window.AudioContext === "function") {
    try {
      const context = new window.AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.18);
      oscillator.onended = () => context.close();
    } catch (error) {
      console.error("Erro ao reproduzir aviso sonoro:", error);
      window.alert("O aviso foi registrado, mas não foi possível reproduzir o som.");
    }
  }
}

function openAssignmentCountFor(tickets, resolverId) {
  return tickets.filter((ticket) =>
    ticket.assignedResolverId === resolverId && !["FECHADO", "SOLUCIONADO", "RESOLVIDO"].includes(ticket.status)
  ).length;
}

function isTicketClosed(ticket) {
  return ["FECHADO", "SOLUCIONADO", "RESOLVIDO"].includes(ticket.status);
}

export default function App() {
  const [tela, setTela] = useState("login");
  const [user, setUser] = useState(null);
  const [ticketStatus, setTicketStatus] = useState("EM ANDAMENTO");
  const [tickets, setTickets] = useState([]);
  const [settings, setSettings] = useState(() => buildDefaultDatabase().settings);
  const [auditLogs, setAuditLogs] = useState([]);
  const [dbReady, setDbReady] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    document.body.dataset.theme = user?.preferences?.appearance?.theme ?? "light";
    document.documentElement.dataset.fontSize = user?.preferences?.appearance?.fontSize ?? "medium";
    return () => {
      delete document.body.dataset.theme;
      delete document.documentElement.dataset.fontSize;
    };
  }, [user?.preferences?.appearance?.fontSize, user?.preferences?.appearance?.theme]);

  useEffect(() => {
    const bootstrapDatabase = async () => {
      try {
        const database = await loadLocalDatabase();
        const defaults = buildDefaultDatabase();
        const isFreshReset = database.dataResetVersion !== LOCAL_DATA_RESET_VERSION;
        if (isFreshReset) {
          Object.keys(localStorage)
            .filter((key) => key.startsWith("pixie-profile-icon"))
            .forEach((key) => localStorage.removeItem(key));
        }
        const initialDatabase = isFreshReset ? {
          ...defaults,
          dataResetVersion: LOCAL_DATA_RESET_VERSION,
        } : {
          ...defaults,
          ...database,
          users: Array.isArray(database.users) ? database.users : [],
          tickets: Array.isArray(database.tickets) ? database.tickets : [],
          assets: Array.isArray(database.assets) ? database.assets : [],
          settings: {
            ...defaults.settings,
            ...database.settings,
            backup: { ...defaults.settings.backup, ...database.settings?.backup },
            security: { ...defaults.settings.security, ...database.settings?.security },
            permissions: { ...defaults.settings.permissions, ...database.settings?.permissions },
          },
          auditLogs: database.auditLogs ?? [],
        };
        const normalizedAssignmentTickets = initialDatabase.tickets.map((ticket) => {
          const normalizedTicket = {
            ...ticket,
            responses: Array.isArray(ticket.responses) ? ticket.responses : [],
          };
          if (ticket.assignedResolverId || !ticket.responsible || ticket.responsible === "Não atribuído") {
            return normalizedTicket;
          }
          return { ...normalizedTicket, assignedResolverId: null, responsible: "Não atribuído" };
        });
        initialDatabase.tickets = normalizedAssignmentTickets;
        const sessionUser = initialDatabase.users.find(
          (item) => item.id === initialDatabase.currentUser?.id,
        );
        const canResumeSession = sessionUser &&
          sessionUser.status !== "PENDENTE" &&
          sessionUser.status !== "BLOQUEADO" &&
          sessionUser.profile !== "Pendente";
        const databaseWithSession = {
          ...initialDatabase,
          currentUser: canResumeSession ? sessionUser : null,
        };
        await saveLocalDatabase(databaseWithSession);
        setUser(databaseWithSession.currentUser);
        setTickets(normalizedAssignmentTickets);
        setSettings(databaseWithSession.settings);
        setAuditLogs(databaseWithSession.auditLogs);
        setSetupRequired(databaseWithSession.users.length === 0);
      } catch (error) {
        console.error("Erro ao carregar banco local:", error);
      } finally {
        setDbReady(true);
      }
    };

    bootstrapDatabase();
  }, []);

  useEffect(() => {
    if (!dbReady) return undefined;

    const alertStaleUnassignedTickets = async () => {
      const database = await loadLocalDatabase();
      const currentTickets = database.tickets ?? [];
      const now = Date.now();
      const staleTickets = currentTickets.filter((ticket) => {
        if (ticket.assignedResolverId || ticket.unassignedAlertedAt || isTicketClosed(ticket)) {
          return false;
        }
        const createdAt = Date.parse(ticket.unassignedSince ?? ticket.createdAt ?? ticket.date?.replace(" ", "T") ?? "");
        return Number.isFinite(createdAt) && now - createdAt >= 30 * 60 * 1000;
      });
      if (!staleTickets.length) return;

      const alertAt = new Date(now).toISOString();
      const staleIds = new Set(staleTickets.map((ticket) => ticket.id));
      const nextTickets = currentTickets.map((ticket) =>
        staleIds.has(ticket.id) ? { ...ticket, unassignedAlertedAt: alertAt } : ticket
      );
      const entries = staleTickets.map((ticket, index) => ({
        id: `audit-${now}-${index}`,
        action: "UNASSIGNED_TICKET_ALERT",
        description: `${ticket.id} está sem responsável há pelo menos 30 minutos.`,
        actorId: null,
        actorName: "Sistema",
        ticketId: ticket.id,
        createdAt: alertAt,
      }));
      const nextAuditLogs = [...entries, ...(database.auditLogs ?? [])];
      await saveLocalDatabase({ ...database, tickets: nextTickets, auditLogs: nextAuditLogs });
      setTickets(nextTickets);
      setAuditLogs(nextAuditLogs);
      const admins = (database.users ?? []).filter((item) => item.profile === "Administrador");
      await Promise.all(staleTickets.flatMap((ticket) => admins.map((admin) =>
        notifyUser(admin, "unassignedTicket", "Chamado sem responsável há 30 minutos", `${ticket.id}: ${ticket.title}`)
      )));
    };

    alertStaleUnassignedTickets().catch((error) => {
      console.error("Erro ao verificar chamados sem responsável:", error);
    });
    const intervalId = window.setInterval(() => {
      alertStaleUnassignedTickets().catch((error) => {
        console.error("Erro ao verificar chamados sem responsável:", error);
      });
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [dbReady]);

  const handleLogin = async (nextUser) => {
    const database = await loadLocalDatabase();
    const lastLoginAt = new Date().toISOString();
    const updatedUser = { ...nextUser, lastLoginAt };
    const nextUsers = (database.users ?? []).map((item) =>
      item.id === updatedUser.id ? updatedUser : item
    );
    await saveLocalDatabase({ ...database, users: nextUsers, currentUser: updatedUser });
    setUser(updatedUser);
  };

  const handleSaveProfile = async (profileChanges) => {
    if (["Resolutor", "Usuário Comum"].includes(user?.profile)) {
      throw new Error("Para alterar seus dados cadastrais, abra um chamado para a administração.");
    }
    const database = await loadLocalDatabase();
    const updatedUser = {
      ...user,
      email: profileChanges.email.trim(),
      telefone: profileChanges.telefone.trim(),
      local: profileChanges.local.trim(),
    };
    const nextUsers = (database.users ?? []).map((item) =>
      item.id === updatedUser.id ? updatedUser : item
    );
    await saveLocalDatabase({ ...database, users: nextUsers, currentUser: updatedUser });
    setUser(updatedUser);
  };

  const handleSavePreferences = async (preferences) => {
    const database = await loadLocalDatabase();
    const updatedUser = { ...user, preferences };
    const nextUsers = (database.users ?? []).map((item) =>
      item.id === updatedUser.id ? updatedUser : item
    );
    await saveLocalDatabase({ ...database, users: nextUsers, currentUser: updatedUser });
    setUser(updatedUser);
  };

  const handleChangePassword = async ({ currentPassword, newPassword }) => {
    const minimumLength = Number(settings.security?.minimumPasswordLength) || 8;
    if (user?.senha !== currentPassword) return "A senha atual não confere.";
    if (newPassword.length < minimumLength) {
      return `A nova senha precisa ter pelo menos ${minimumLength} caracteres.`;
    }
    if (newPassword === currentPassword) {
      return "Escolha uma senha diferente da atual.";
    }

    const database = await loadLocalDatabase();
    const updatedUser = {
      ...user,
      senha: newPassword,
      mustChangePassword: false,
      passwordChangeRequired: false,
    };
    const nextUsers = (database.users ?? []).map((item) =>
      item.id === updatedUser.id ? updatedUser : item
    );
    const auditEntry = {
      id: `audit-${Date.now()}`,
      action: "PASSWORD_CHANGED",
      description: "Alterou a própria senha",
      actorId: user.id,
      actorName: user.nome,
      createdAt: new Date().toISOString(),
    };
    const auditLogsNext = [auditEntry, ...(database.auditLogs ?? [])];
    await saveLocalDatabase({
      ...database,
      users: nextUsers,
      currentUser: updatedUser,
      auditLogs: auditLogsNext,
    });
    setUser(updatedUser);
    setAuditLogs(auditLogsNext);
    return "";
  };

  const handleSaveSettings = async (nextSettings, description) => {
    const database = await loadLocalDatabase();
    const nextAuditLog = {
      id: `audit-${Date.now()}`,
      action: "CONFIGURATION_UPDATED",
      description,
      actorId: user?.id,
      actorName: user?.nome ?? "Administrador",
      createdAt: new Date().toISOString(),
    };
    const retentionMs = Math.max(1, Number(nextSettings.auditRetentionDays) || 365) * 86400000;
    const retentionLimit = Date.now() - retentionMs;
    const nextAuditLogs = [nextAuditLog, ...(database.auditLogs ?? [])]
      .filter((entry) => {
        const timestamp = Date.parse(entry.createdAt ?? "");
        return !Number.isFinite(timestamp) || timestamp >= retentionLimit;
      });
    await saveLocalDatabase({ ...database, settings: nextSettings, auditLogs: nextAuditLogs });
    setSettings(nextSettings);
    setAuditLogs(nextAuditLogs);
  };

  async function recordAssignmentAudit(database, action, ticket, description) {
    const entry = {
      id: `audit-${Date.now()}`,
      action,
      description,
      actorId: user?.id,
      actorName: user?.nome ?? "Administração",
      createdAt: new Date().toISOString(),
      ticketId: ticket.id,
    };
    const nextAuditLogs = [entry, ...(database.auditLogs ?? [])];
    return nextAuditLogs;
  }

  const handleAssignTicket = async (ticketId, resolverId, reason) => {
    if (user?.profile !== "Administrador") throw new Error("Somente a administração pode atribuir chamados.");
    if (!reason?.trim()) throw new Error("Informe o motivo da atribuição.");
    const database = await loadLocalDatabase();
    const ticket = (database.tickets ?? tickets).find((item) => item.id === ticketId);
    const resolver = (database.users ?? []).find((item) =>
      item.id === resolverId && item.profile === "Resolutor"
    );
    if (!ticket || !resolver || isTicketClosed(ticket)) throw new Error("Chamado aberto ou resolutor não encontrado.");
    const wasAssigned = Boolean(ticket.assignedResolverId);
    const assignedAt = new Date().toISOString();
    const history = [
      ...(ticket.assignmentHistory ?? []),
      {
        action: wasAssigned ? "REASSIGNED" : "ASSIGNED",
        fromResolverId: ticket.assignedResolverId ?? null,
        toResolverId: resolver.id,
        actorId: user?.id,
        actorName: user?.nome ?? "Administração",
        reason: reason.trim(),
        createdAt: assignedAt,
      },
    ];
    const updatedTicket = {
      ...ticket,
      assignedResolverId: resolver.id,
      responsible: resolver.nome,
      assignedAt,
      resolverOpenedAt: null,
      updatedAt: assignedAt,
      unassignedSince: null,
      unassignedAlertedAt: null,
      returnReason: null,
      status: "EM ANDAMENTO",
      assignmentHistory: history,
    };
    const nextTickets = (database.tickets ?? tickets).map((item) =>
      item.id === ticketId ? updatedTicket : item
    );
    let nextAuditLogs = await recordAssignmentAudit(
      database,
      wasAssigned ? "TICKET_REASSIGNED" : "TICKET_ASSIGNED",
      updatedTicket,
      `${wasAssigned ? "Reatribuiu" : "Atribuiu"} ${ticketId} a ${resolver.nome}. Motivo: ${reason.trim()}`
    );
    if (resolver.resolverStatus === "AUSENTE") {
      nextAuditLogs = [{
        id: `audit-${Date.now()}-absent`,
        action: "RESOLVER_ABSENT_WITH_OPEN_TICKETS",
        description: `${resolver.nome} está Ausente com ${openAssignmentCountFor(nextTickets, resolver.id)} chamado(s) em aberto.`,
        actorId: null,
        actorName: "Sistema",
        ticketId,
        createdAt: assignedAt,
      }, ...nextAuditLogs];
    }
    await saveLocalDatabase({ ...database, tickets: nextTickets, auditLogs: nextAuditLogs });
    setTickets(nextTickets);
    setAuditLogs(nextAuditLogs);
    await notifyUser(resolver, "ticketAssigned", "Chamado atribuído a você", `${ticketId}: ${ticket.title}`);
    if (resolver.resolverStatus === "AUSENTE") {
      const admins = (database.users ?? []).filter((item) => item.profile === "Administrador");
      await Promise.all(admins.map((admin) =>
        notifyUser(admin, "resolverAbsent", "Resolutor ausente com chamados", `${resolver.nome} recebeu ${ticketId} enquanto está Ausente.`)
      ));
    }
  };

  const handleUpdateTicketPriority = async (ticketId, priority) => {
    if (user?.profile !== "Administrador") throw new Error("Somente a administração pode alterar a prioridade.");
    const database = await loadLocalDatabase();
    const currentTickets = database.tickets ?? tickets;
    const targetTicket = currentTickets.find((ticket) => ticket.id === ticketId);
    if (!targetTicket) throw new Error("Chamado não encontrado.");
    const prioritySetting = settings.priorities.find((item) => item.name.toUpperCase() === priority.toUpperCase());
    if (!prioritySetting) throw new Error("Prioridade inválida.");
    const openedAt = new Date(targetTicket.createdAt ?? targetTicket.date?.replace(" ", "T") ?? "");
    const startTime = Number.isNaN(openedAt.getTime()) ? Date.now() : openedAt.getTime();
    const resolutionDueAt = new Date(startTime + prioritySetting.resolutionHours * 3600000);
    const remainingHours = Math.ceil((resolutionDueAt.getTime() - Date.now()) / 3600000);
    const nextTickets = currentTickets.map((ticket) => ticket.id === ticketId
      ? {
          ...ticket,
          priority: prioritySetting.name.toUpperCase(),
          responseDueAt: new Date(startTime + prioritySetting.responseHours * 3600000).toISOString(),
          resolutionDueAt: resolutionDueAt.toISOString(),
          sla: remainingHours > 0 ? `${remainingHours}H RESTANTES` : "VENCEU",
        }
      : ticket);
    await saveLocalDatabase({ ...database, tickets: nextTickets });
    setTickets(nextTickets);
  };

  const handleReturnTicket = async (ticketId, reason) => {
    if (user?.profile !== "Resolutor") throw new Error("Somente o resolutor responsável pode devolver o chamado.");
    if (!reason?.trim() || reason.trim().length < 5) throw new Error("Informe o motivo da devolução.");
    const database = await loadLocalDatabase();
    const currentTickets = database.tickets ?? tickets;
    const ticket = currentTickets.find((item) => item.id === ticketId);
    if (!ticket || ticket.assignedResolverId !== user?.id || isTicketClosed(ticket)) {
      throw new Error("Este chamado não está atribuído a você.");
    }
    const returnedAt = new Date().toISOString();
    const history = [
      ...(ticket.assignmentHistory ?? []),
      {
        action: "RETURNED",
        fromResolverId: user.id,
        toResolverId: null,
        actorId: user.id,
        actorName: user.nome,
        reason: reason.trim(),
        createdAt: returnedAt,
      },
    ];
    const updatedTicket = {
      ...ticket,
      assignedResolverId: null,
      responsible: "Não atribuído",
      assignedAt: null,
      returnedAt,
      updatedAt: returnedAt,
      unassignedSince: returnedAt,
      returnReason: reason.trim(),
      status: "ABERTO",
      unassignedAlertedAt: null,
      assignmentHistory: history,
    };
    const nextTickets = currentTickets.map((item) =>
      item.id === ticketId ? updatedTicket : item
    );
    const nextAuditLogs = await recordAssignmentAudit(
      database,
      "TICKET_RETURNED",
      updatedTicket,
      `${user.nome} devolveu ${ticketId} à administração. Motivo: ${reason.trim()}`
    );
    await saveLocalDatabase({ ...database, tickets: nextTickets, auditLogs: nextAuditLogs });
    setTickets(nextTickets);
    setAuditLogs(nextAuditLogs);
    const admins = (database.users ?? []).filter((item) => item.profile === "Administrador");
    await Promise.all(admins.map((admin) =>
      notifyUser(admin, "ticketReturned", "Chamado devolvido ao admin", `${ticketId}: ${reason.trim()}`)
    ));
  };

  const handleUpdateResolverStatus = async (resolverStatus) => {
    if (user?.profile !== "Resolutor" || !["AUSENTE", "DISPONIVEL", "EM_ATENDIMENTO"].includes(resolverStatus)) {
      throw new Error("Status de disponibilidade inválido.");
    }
    const database = await loadLocalDatabase();
    const updatedUser = { ...user, resolverStatus };
    const nextUsers = (database.users ?? []).map((item) =>
      item.id === updatedUser.id ? updatedUser : item
    );
    const openAssignments = (database.tickets ?? tickets).filter((ticket) =>
      ticket.assignedResolverId === user.id && !isTicketClosed(ticket)
    );
    let nextAuditLogs = database.auditLogs ?? [];
    if (resolverStatus === "AUSENTE" && openAssignments.length) {
      const entry = {
        id: `audit-${Date.now()}`,
        action: "RESOLVER_ABSENT_WITH_OPEN_TICKETS",
        description: `${user.nome} ficou Ausente com ${openAssignments.length} chamado(s) em aberto: ${openAssignments.map((ticket) => ticket.id).join(", ")}`,
        actorId: user.id,
        actorName: user.nome,
        createdAt: new Date().toISOString(),
      };
      nextAuditLogs = [entry, ...nextAuditLogs];
    }
    await saveLocalDatabase({
      ...database,
      users: nextUsers,
      currentUser: updatedUser,
      auditLogs: nextAuditLogs,
    });
    setUser(updatedUser);
    setAuditLogs(nextAuditLogs);
    if (resolverStatus === "AUSENTE" && openAssignments.length) {
      const admins = nextUsers.filter((item) => item.profile === "Administrador");
      await Promise.all(admins.map((admin) =>
        notifyUser(admin, "resolverAbsent", "Resolutor ausente com chamados", `${user.nome}: ${openAssignments.map((ticket) => ticket.id).join(", ")}`)
      ));
    }
  };

  const handleOpenResolverTicket = async (ticketId) => {
    if (user?.profile !== "Resolutor") {
      throw new Error("Somente o resolutor pode marcar este chamado como visualizado.");
    }
    const database = await loadLocalDatabase();
    const currentTickets = database.tickets ?? tickets;
    const ticket = currentTickets.find((item) => item.id === ticketId);
    if (!ticket || ticket.assignedResolverId !== user.id || isTicketClosed(ticket)) {
      throw new Error("Este chamado não está atribuído a você.");
    }
    if (ticket.resolverOpenedAt) return;

    const resolverOpenedAt = new Date().toISOString();
    const nextTickets = currentTickets.map((item) =>
      item.id === ticketId ? { ...item, resolverOpenedAt } : item
    );
    await saveLocalDatabase({ ...database, tickets: nextTickets });
    setTickets(nextTickets);
  };

  const handleRegister = async (details) => {
    const database = await loadLocalDatabase();
    const cpfDigits = details.cpf.replace(/\D/g, "");
    const users = database.users ?? [];
    if (users.some((item) => item.cpf?.replace(/\D/g, "") === cpfDigits)) {
      return "Já existe um usuário cadastrado com este CPF.";
    }

    if (users.length === 0) {
      const minimumLength = Number(database.settings?.security?.minimumPasswordLength) || 8;
      if (!details.password || details.password.length < minimumLength) {
        return `A senha precisa ter pelo menos ${minimumLength} caracteres.`;
      }
      if (details.password !== details.confirmPassword) {
        return "A confirmação de senha não corresponde.";
      }
      const admin = {
        id: `user-${Date.now()}`,
        nome: details.nome.trim(),
        cpf: details.cpf,
        email: details.email.trim(),
        departamento: details.setor.trim(),
        cargo: details.cargo.trim(),
        dataAniversario: details.dataAniversario,
        senha: details.password,
        profile: "Administrador",
        status: "ATIVO",
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
      };
      await saveLocalDatabase({ ...database, users: [admin], currentUser: null });
      setSetupRequired(false);
      await handleLogin(admin);
      return "";
    }

    const newUser = {
      id: `user-${Date.now()}`,
      nome: details.nome.trim(),
      cpf: details.cpf,
      email: details.email.trim(),
      departamento: details.setor.trim(),
      cargo: details.cargo.trim(),
      dataAniversario: details.dataAniversario,
      profile: "Pendente",
      status: "PENDENTE",
      createdAt: new Date().toISOString(),
    };
    await saveLocalDatabase({ ...database, users: [...users, newUser] });
    return "";
  };

  const handleCreateTicket = async (details) => {
    const database = await loadLocalDatabase();
    const currentTickets = database.tickets ?? tickets;
    const nextNumber = currentTickets.reduce((highest, ticket) => {
      const number = Number(ticket.id?.replace(/\D/g, "")) || 0;
      return Math.max(highest, number);
    }, 0) + 1;
    const priority = details.priority.toUpperCase();
    const slaPriority = settings.priorities.find((item) => item.name.toUpperCase() === priority);
    const openedAt = new Date();
    const responseHours = slaPriority?.responseHours ?? 8;
    const resolutionHours = slaPriority?.resolutionHours ?? 24;
    const newTicket = {
      id: `TKT-${String(nextNumber).padStart(5, "0")}`,
      category: details.category.toUpperCase(),
      title: details.title.trim(),
      description: details.description.trim(),
      status: "ABERTO",
      priority,
      responsible: "Não atribuído",
      assignedResolverId: null,
      unassignedSince: openedAt.toISOString(),
      createdAt: openedAt.toISOString(),
      assignmentHistory: [],
      date: openedAt.toLocaleString("sv-SE"),
      responseDueAt: new Date(openedAt.getTime() + responseHours * 3600000).toISOString(),
      resolutionDueAt: new Date(openedAt.getTime() + resolutionHours * 3600000).toISOString(),
      sla: `${resolutionHours}H RESTANTES`,
      requesterId: user?.id,
      requesterName: user?.nome ?? "Usuário",
      requesterPhone: details.requesterPhone,
      requesterLocation: details.requesterLocation,
      department: details.department,
      assetId: details.assetId.trim(),
      responses: [],
    };
    const nextTickets = [newTicket, ...currentTickets];
    await saveLocalDatabase({ ...database, tickets: nextTickets });
    setTickets(nextTickets);
    const admins = (database.users ?? []).filter((item) => item.profile === "Administrador");
    await Promise.all(admins.map((admin) =>
      notifyUser(admin, "unassignedTicket", "Novo chamado sem responsável", `${newTicket.id}: ${newTicket.title}`)
    ));
    return newTicket;
  };

  const handleTicketReply = async (ticketId, text) => {
    const database = await loadLocalDatabase();
    const currentTickets = database.tickets ?? tickets;
    const targetTicket = currentTickets.find((ticket) => ticket.id === ticketId);
    if (!targetTicket) throw new Error("Chamado não encontrado.");
    if (user?.profile === "Resolutor" && (targetTicket.assignedResolverId !== user.id || isTicketClosed(targetTicket))) {
      throw new Error("Você só pode responder aos chamados atribuídos a você.");
    }
    const response = {
      id: `reply-${Date.now()}`,
      text: text.trim(),
      authorId: user?.id,
      authorName: user?.nome ?? "Resolutor",
      authorProfile: user?.profile ?? "Resolutor",
      date: new Date().toLocaleString("sv-SE"),
    };
    const nextTickets = currentTickets.map((ticket) => ticket.id === ticketId
      ? { ...ticket, responses: [...(ticket.responses ?? []), response], updatedAt: response.date }
      : ticket);
    await saveLocalDatabase({ ...database, tickets: nextTickets });
    setTickets(nextTickets);
    const ticket = targetTicket;
    const requester = database.users?.find((item) =>
      item.id === ticket?.requesterId || item.nome === ticket?.requesterName
    );
    if (ticket && response.authorId !== ticket.requesterId) {
      await notifyUser(requester, "ticketReplied", "Chamado respondido", `${ticket.id}: ${ticket.title}`);
    }
  };

  const handleResolveTicket = async (ticketId) => {
    const database = await loadLocalDatabase();
    const currentTickets = database.tickets ?? tickets;
    const targetTicket = currentTickets.find((ticket) => ticket.id === ticketId);
    if (!targetTicket) throw new Error("Chamado não encontrado.");
    if (user?.profile === "Resolutor" && (targetTicket.assignedResolverId !== user.id || isTicketClosed(targetTicket))) {
      throw new Error("Você só pode resolver chamados atribuídos a você.");
    }
    if (user?.profile === "Resolutor" && !targetTicket.responses?.some((response) =>
      response.authorId === user.id && response.authorProfile === "Resolutor"
    )) {
      throw new Error("Envie uma resposta antes de solucionar o chamado.");
    }
    const closedAt = new Date();
    const nextTickets = currentTickets.map((ticket) => {  
      if (ticket.id !== ticketId) return ticket;
      const openedAt = new Date(ticket.date?.replace(" ", "T"));
      const priority = settings.priorities.find((item) => item.name.toUpperCase() === ticket.priority?.toUpperCase());
      const deadline = ticket.resolutionDueAt
        ? new Date(ticket.resolutionDueAt)
        : new Date(openedAt.getTime() + (priority?.resolutionHours ?? 24) * 3600000);
      const metSla = !Number.isNaN(deadline.getTime()) && closedAt <= deadline;
      return { ...ticket, status: "FECHADO", sla: metSla ? "RESOLVIDO NO PRAZO" : "VENCEU", updatedAt: closedAt.toLocaleString("sv-SE"), closedAt: closedAt.toISOString() };
    });
    await saveLocalDatabase({ ...database, tickets: nextTickets });
    setTickets(nextTickets);
    setTicketStatus("FECHADO");
    const resolvedTicket = nextTickets.find((ticket) => ticket.id === ticketId);
    const requester = database.users?.find((item) =>
      item.id === resolvedTicket?.requesterId || item.nome === resolvedTicket?.requesterName
    );
    if (resolvedTicket && user?.id !== resolvedTicket.requesterId) {
      await notifyUser(requester, "ticketResolved", "Chamado resolvido", `${ticketId} foi resolvido.`);
    }
  };

  const handleLogout = async () => {
    const database = await loadLocalDatabase();
    await saveLocalDatabase({ ...database, currentUser: null });
    setUser(null);
    setTela("login");
    setTicketStatus("EM ANDAMENTO");
  };

  if (!dbReady) {
    return null;
  }

  if (setupRequired && !user) {
    return (
      <Cadastro
        firstRun
        onSaved={handleRegister}
        onGoToLogin={() => setTela("login")}
        departments={settings.departments}
      />
    );
  }

  if (user) {
    if (user.profile === "Resolutor") {
      return (
        <Resolutor
          user={user}
          tickets={tickets}
          settings={settings}
          auditLogs={auditLogs}
          onSaveSettings={handleSaveSettings}
          ticketStatus={ticketStatus}
          onReplyToTicket={handleTicketReply}
          onResolveTicket={handleResolveTicket}
          onAssignTicket={handleAssignTicket}
          onUpdateTicketPriority={handleUpdateTicketPriority}
          onReturnTicket={handleReturnTicket}
          onOpenResolverTicket={handleOpenResolverTicket}
          onUpdateResolverStatus={handleUpdateResolverStatus}
          onSaveProfile={handleSaveProfile}
          onSavePreferences={handleSavePreferences}
          onChangePassword={handleChangePassword}
          onLogout={handleLogout}
        />
      );
    }
    if (user.profile === "Usuário Comum") {
      return (
        <UserDashboard
          user={user}
          tickets={tickets}
          settings={settings}
          ticketStatus={ticketStatus}
          onCreateTicket={handleCreateTicket}
          onReplyToTicket={handleTicketReply}
          onResolveTicket={handleResolveTicket}
          onAssignTicket={handleAssignTicket}
          onUpdateTicketPriority={handleUpdateTicketPriority}
          onReturnTicket={handleReturnTicket}
          onSaveProfile={handleSaveProfile}
          onSavePreferences={handleSavePreferences}
          onChangePassword={handleChangePassword}
          onLogout={handleLogout}
        />
      );
    }
    return (
      <AdminDashboard
        user={user}
        tickets={tickets}
        settings={settings}
        auditLogs={auditLogs}
        onSaveSettings={handleSaveSettings}
        onCreateTicket={handleCreateTicket}
        onReplyToTicket={handleTicketReply}
        onResolveTicket={handleResolveTicket}
        onAssignTicket={handleAssignTicket}
        onUpdateTicketPriority={handleUpdateTicketPriority}
        onReturnTicket={handleReturnTicket}
        onUpdateResolverStatus={handleUpdateResolverStatus}
        onOpenResolverTicket={handleOpenResolverTicket}
        onSaveProfile={handleSaveProfile}
        onSavePreferences={handleSavePreferences}
        onChangePassword={handleChangePassword}
        onLogout={handleLogout}
      />
    );
  }

  if (tela === "cadastro") {
    return (
      <Cadastro
        onSaved={handleRegister}
        onGoToLogin={() => setTela("login")}
        departments={settings.departments}
      />
    );
  }

  return (
    <Login
      onLogin={handleLogin}
      onGoToCadastro={() => setTela("cadastro")}
    />
  );
}
