const EMPTY_DB = {
  currentUser: null,
  users: [],
  tickets: [],
  assets: [],
  settings: {
    appName: "WG Chamados",
    offlineMode: true,
    lastSyncAt: null,
    categories: [
      { id: "hardware", name: "Hardware", active: true },
      { id: "software", name: "Software", active: true },
      { id: "access", name: "Acesso", active: true },
      { id: "network", name: "Rede", active: true },
    ],
    priorities: [
      { name: "Crítica", responseHours: 1, resolutionHours: 2 },
      { name: "Alta", responseHours: 2, resolutionHours: 4 },
      { name: "Média", responseHours: 4, resolutionHours: 8 },
      { name: "Baixa", responseHours: 8, resolutionHours: 24 },
    ],
    departments: ["Administrativo", "Financeiro", "Recursos Humanos", "Recepção", "TI"],
    statusFlow: ["ABERTO", "EM ANDAMENTO", "AGUARDANDO", "FECHADO"],
    assignmentMode: "manual",
    permissions: {
      "Usuário Comum": ["createTicket", "viewOwnTickets"],
      Resolutor: ["viewOpenTickets", "replyTickets", "closeTickets"],
      Administrador: ["all"],
    },
    security: {
      minimumPasswordLength: 8,
      requirePasswordChange: true,
      sessionTimeoutMinutes: 30,
      maxLoginAttempts: 5,
    },
    auditRetentionDays: 365,
    backup: {
      frequency: "weekly",
      folder: "",
      lastBackupAt: null,
    },
  },
  auditLogs: [],
};

const DATABASE_STORAGE_KEY = "chamados-local-db";
const PREVIOUS_DATABASE_STORAGE_KEY = "pixie-local-db";

export function buildDefaultDatabase() {
  return JSON.parse(JSON.stringify(EMPTY_DB));
}

export async function loadLocalDatabase() {
  if (window?.electronAPI?.getData) {
    const data = await window.electronAPI.getData();
    return data && Object.keys(data).length ? data : buildDefaultDatabase();
  }

  let saved = localStorage.getItem(DATABASE_STORAGE_KEY);
  let migratedPreviousStorage = false;
  if (!saved) {
    saved = localStorage.getItem(PREVIOUS_DATABASE_STORAGE_KEY);
    if (saved) {
      localStorage.setItem(DATABASE_STORAGE_KEY, saved);
      migratedPreviousStorage = true;
    }
  }
  if (!saved) {
    const seeded = buildDefaultDatabase();
    localStorage.setItem(DATABASE_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  try {
    const parsed = JSON.parse(saved);
    if (parsed && Object.keys(parsed).length) {
      if (migratedPreviousStorage) localStorage.removeItem(PREVIOUS_DATABASE_STORAGE_KEY);
      return parsed;
    }
    return buildDefaultDatabase();
  } catch {
    const fallback = buildDefaultDatabase();
    localStorage.setItem(DATABASE_STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
}

export async function saveLocalDatabase(nextDatabase) {
  const defaults = buildDefaultDatabase();
  const normalized = {
    ...defaults,
    ...nextDatabase,
    settings: { ...defaults.settings, ...nextDatabase.settings },
    auditLogs: nextDatabase.auditLogs ?? defaults.auditLogs,
  };

  if (window?.electronAPI?.saveData) {
    await window.electronAPI.saveData(normalized);
    return normalized;
  }

  localStorage.setItem(DATABASE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
