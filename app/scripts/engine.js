import {
  DIALOG_KEYS,
  FORM_MESSAGES,
  FREE_MAX_PROMPTS,
  PREMIUM_LICENSE_DURATION_DAYS,
  SALES_LANDING_PAGE_URL,
  SEED_PATHS,
  TOAST_DURATION_MS,
  TOAST_MESSAGES
} from "./constants.js";
import {
  getPromptCountTotal,
  getState,
  isPremiumUser,
  setState
} from "./states.js";
import * as api from "./api.js";
import {
  allocateId,
  allocateName,
  buildExportPayload,
  cleanJsonText,
  copyText,
  createFolderRecord,
  createPromptRecord,
  downloadJsonFile,
  openUrl,
  parseImportPayload,
  slugify,
  toTimestamp,
  validateLicenseKey
} from "./service.js";

const INLINE_SEED = {
  folders: [
    { id: "folder-1", name: "Marketing", createdAt: 1704067200000, updatedAt: 1704067200000 },
    { id: "folder-2", name: "Desenvolvimento", createdAt: 1704153600000, updatedAt: 1704153600000 },
    { id: "folder-3", name: "Suporte", createdAt: 1704240000000, updatedAt: 1704240000000 }
  ],
  prompts: [
    {
      id: "prompt-1",
      folderId: "folder-1",
      nome: "Post para Redes Sociais",
      conteudo: "Crie um post engajador para [plataforma] sobre [tema]. Inclua uma chamada para ação clara e use uma linguagem [tom].",
      createdAt: 1704067200000,
      updatedAt: 1704067200000
    },
    {
      id: "prompt-2",
      folderId: "folder-1",
      nome: "Email Marketing",
      conteudo: "Escreva um email de marketing para promover [produto/serviço]. O email deve ser persuasivo, mas não agressivo, e destacar os principais benefícios.",
      createdAt: 1704070800000,
      updatedAt: 1704070800000
    },
    {
      id: "prompt-3",
      folderId: "folder-2",
      nome: "Revisão de Código",
      conteudo: "Revise o seguinte código [código] e forneça feedback sobre: performance, segurança, legibilidade e boas práticas.",
      createdAt: 1704153600000,
      updatedAt: 1704153600000
    },
    {
      id: "prompt-4",
      folderId: "folder-2",
      nome: "Documentação de API",
      conteudo: "Crie documentação completa para a API [nome]. Inclua exemplos de requisições, respostas e casos de uso.",
      createdAt: 1704157200000,
      updatedAt: 1704157200000
    },
    {
      id: "prompt-5",
      folderId: "folder-3",
      nome: "Resposta de Suporte",
      conteudo: "Crie uma resposta profissional e empática para o seguinte problema do cliente: [descrição do problema]. A resposta deve ser clara e oferecer uma solução.",
      createdAt: 1704240000000,
      updatedAt: 1704240000000
    }
  ]
};

let loadToken = 0;

function createToast(message, variant) {
  const toast = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    message: message,
    variant: variant
  };

  globalThis.setTimeout(function dismissToast() {
    const current = getState();

    if (!current.ui.toast || current.ui.toast.id !== toast.id) {
      return;
    }

    setState(function clearToast(latest) {
      if (!latest.ui.toast || latest.ui.toast.id !== toast.id) {
        return latest;
      }

      return {
        ...latest,
        ui: {
          ...latest.ui,
          toast: null
        }
      };
    });
  }, TOAST_DURATION_MS);

  return toast;
}

function showToast(message, variant) {
  const toast = createToast(message, variant);

  setState(function applyToast(current) {
    return {
      ...current,
      ui: {
        ...current.ui,
        toast: toast
      }
    };
  });
}

function closeDialogMap(dialogs) {
  const next = {};

  Object.keys(dialogs).forEach(function close(key) {
    next[key] = false;
  });

  return next;
}

function openDialog(dialogKey, extraUi) {
  setState(function open(current) {
    if (current.ui.loading) {
      return current;
    }

    const dialogs = closeDialogMap(current.ui.dialogs);
    dialogs[dialogKey] = true;

    return {
      ...current,
      ui: {
        ...current.ui,
        ...(extraUi || {}),
        formErrors: {},
        dialogs: dialogs
      }
    };
  });
}

function closeDialogs() {
  setState(function close(current) {
    return {
      ...current,
      ui: {
        ...current.ui,
        formErrors: {},
        activeFolderId: null,
        activePromptId: null,
        dialogs: closeDialogMap(current.ui.dialogs)
      }
    };
  });
}

function validateFolderName(name) {
  if (typeof name !== "string" || name.trim().length === 0) {
    return { ok: false, message: FORM_MESSAGES.folderNameRequired };
  }

  return { ok: true, value: name.trim() };
}

function validatePromptFields(fields, folders) {
  const errors = {};
  const folderId = String(fields.folderId ?? "");
  const nome = typeof fields.nome === "string" ? fields.nome.trim() : "";
  const conteudo = typeof fields.conteudo === "string" ? fields.conteudo : "";

  if (!folderId || !folders[folderId]) {
    errors.folder = FORM_MESSAGES.folderRequired;
  }

  if (!nome) {
    errors.nome = FORM_MESSAGES.promptNameRequired;
  }

  if (!conteudo.trim()) {
    errors.conteudo = FORM_MESSAGES.promptContentRequired;
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors: errors,
    value: {
      folderId: folderId,
      nome: nome,
      conteudo: conteudo
    }
  };
}

function formatPlanDate(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(timestamp));
}

function assertSeedShape(seed) {
  if (!seed || !Array.isArray(seed.folders) || !Array.isArray(seed.prompts)) {
    throw new Error("Seed inválido");
  }

  return seed;
}

function normalizeSeed(seed) {
  const source = assertSeedShape(seed);
  const folders = {};
  const prompts = {};
  const folderPrompts = {};

  source.folders.forEach(function addFolder(folder) {
    if (!folder || !folder.id || !folder.name) {
      return;
    }

    const id = String(folder.id);
    folders[id] = {
      id: id,
      name: String(folder.name),
      createdAt: toTimestamp(folder.createdAt, Date.now()),
      updatedAt: toTimestamp(folder.updatedAt, Date.now())
    };
    folderPrompts[id] = [];
  });

  source.prompts.forEach(function addPrompt(prompt) {
    if (!prompt || !prompt.id || !prompt.folderId || !folders[prompt.folderId]) {
      return;
    }

    const id = String(prompt.id);
    const folderId = String(prompt.folderId);

    prompts[id] = {
      id: id,
      folderId: folderId,
      nome: String(prompt.nome ?? ""),
      conteudo: String(prompt.conteudo ?? ""),
      createdAt: toTimestamp(prompt.createdAt, Date.now()),
      updatedAt: toTimestamp(prompt.updatedAt, Date.now())
    };
    folderPrompts[folderId].push(id);
  });

  return {
    folders: folders,
    prompts: prompts,
    folderPrompts: folderPrompts
  };
}

async function fetchSeed(path) {
  const response = await fetch(path, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} em ${path}`);
  }

  const text = await response.text();
  const cleanText = cleanJsonText(text);

  try {
    return JSON.parse(cleanText);
  } catch (error) {
    console.error("Falha ao interpretar seed", {
      path: path,
      sample: cleanText.slice(0, 200),
      firstCharCode: cleanText.charCodeAt(0),
      error: error
    });
    throw error;
  }
}

async function loadSeed() {
  for (let index = 0; index < SEED_PATHS.length; index += 1) {
    const path = SEED_PATHS[index];

    try {
      const seed = await fetchSeed(path);
      return assertSeedShape(seed);
    } catch (error) {
      console.warn("Seed indisponível", path, error);
    }
  }

  if (globalThis.chrome && chrome.runtime && chrome.runtime.getURL) {
    try {
      const runtimePath = chrome.runtime.getURL("data/seed.json");
      const seed = await fetchSeed(runtimePath);
      return assertSeedShape(seed);
    } catch (error) {
      console.warn("Seed indisponível pela URL da extensão", error);
    }
  }

  console.warn("Usando seed interno porque nenhum arquivo pôde ser lido");
  return assertSeedShape(INLINE_SEED);
}

function collectIds(state) {
  return new Set([
    ...Object.keys(state.data.folders),
    ...Object.keys(state.data.prompts)
  ]);
}

function canCreatePrompt(state) {
  if (isPremiumUser()) {
    return true;
  }

  return getPromptCountTotal() < FREE_MAX_PROMPTS;
}

function requestPremium() {
  showToast(TOAST_MESSAGES.premiumFeature, "error");
  openUrl(SALES_LANDING_PAGE_URL);
}

function blockFreeLimit() {
  showToast(TOAST_MESSAGES.limitReached, "error");
  openUrl(SALES_LANDING_PAGE_URL);
}

async function initializeApp() {
  const token = loadToken + 1;
  loadToken = token;

  setState(function startLoading(current) {
    return {
      ...current,
      ui: {
        ...current.ui,
        loading: true,
        error: null
      }
    };
  });

  try {
    const seed = await loadSeed();

    if (token !== loadToken) {
      return;
    }

    const data = normalizeSeed(seed);

    setState(function applySeed(current) {
      return {
        ...current,
        data: data,
        ui: {
          ...current.ui,
          loading: false,
          error: null,
          formErrors: {},
          expandedFolders: {},
          activeFolderId: null,
          activePromptId: null,
          dialogs: closeDialogMap(current.ui.dialogs)
        }
      };
    });
  } catch (error) {
    console.error("Falha completa ao iniciar o Prompt DRIVE", error);

    if (token !== loadToken) {
      return;
    }

    setState(function applyError(current) {
      return {
        ...current,
        ui: {
          ...current.ui,
          loading: false,
          error: { message: TOAST_MESSAGES.seedError }
        }
      };
    });
  }
}

function openCreateFolderDialog() {
  openDialog(DIALOG_KEYS.folder, {
    activeFolderId: null,
    activePromptId: null
  });
}

function submitCreateFolder(name) {
  const validation = validateFolderName(name);

  if (!validation.ok) {
    const toast = createToast(TOAST_MESSAGES.folderError, "error");

    setState(function invalidFolder(current) {
      return {
        ...current,
        ui: {
          ...current.ui,
          formErrors: { folderName: validation.message },
          toast: toast
        }
      };
    });
    return;
  }

  try {
    const current = getState();
    const folder = createFolderRecord(validation.value, collectIds(current));

    api.createFolder({
      userId: String(current.user.id),
      folderId: String(folder.id),
      folderName: String(folder.name)
    });

    const toast = createToast(TOAST_MESSAGES.folderCreated, "success");

    setState(function addFolder(latest) {
      return {
        ...latest,
        data: {
          ...latest.data,
          folders: {
            ...latest.data.folders,
            [folder.id]: folder
          },
          folderPrompts: {
            ...latest.data.folderPrompts,
            [folder.id]: []
          }
        },
        ui: {
          ...latest.ui,
          formErrors: {},
          activeFolderId: null,
          activePromptId: null,
          expandedFolders: {
            ...latest.ui.expandedFolders,
            [folder.id]: true
          },
          dialogs: closeDialogMap(latest.ui.dialogs),
          toast: toast
        }
      };
    });
  } catch (error) {
    console.error(error);
    const toast = createToast(TOAST_MESSAGES.folderError, "error");

    setState(function folderFailed(latest) {
      return {
        ...latest,
        ui: {
          ...latest.ui,
          formErrors: { folderName: TOAST_MESSAGES.folderError },
          toast: toast
        }
      };
    });
  }
}

function openEditFolderDialog(folderId) {
  const folder = getState().data.folders[folderId];

  if (!folder) {
    showToast(TOAST_MESSAGES.folderUpdateError, "error");
    return;
  }

  openDialog(DIALOG_KEYS.editFolder, {
    activeFolderId: folderId,
    activePromptId: null
  });
}

function submitEditFolder(name) {
  const validation = validateFolderName(name);
  const current = getState();
  const folder = current.data.folders[current.ui.activeFolderId];

  if (!folder) {
    showToast(TOAST_MESSAGES.folderUpdateError, "error");
    return;
  }

  if (!validation.ok) {
    const toast = createToast(TOAST_MESSAGES.folderUpdateError, "error");

    setState(function invalidEdit(latest) {
      return {
        ...latest,
        ui: {
          ...latest.ui,
          formErrors: { editFolderName: validation.message },
          toast: toast
        }
      };
    });
    return;
  }

  try {
    const now = Date.now();

    api.updateFolder({
      userId: String(current.user.id),
      folderId: String(folder.id),
      folderName: String(validation.value)
    });

    const toast = createToast(TOAST_MESSAGES.folderUpdated, "success");

    setState(function updateFolder(latest) {
      const existing = latest.data.folders[folder.id];

      if (!existing) {
        return latest;
      }

      return {
        ...latest,
        data: {
          ...latest.data,
          folders: {
            ...latest.data.folders,
            [folder.id]: {
              ...existing,
              name: validation.value,
              updatedAt: now
            }
          }
        },
        ui: {
          ...latest.ui,
          formErrors: {},
          activeFolderId: null,
          activePromptId: null,
          dialogs: closeDialogMap(latest.ui.dialogs),
          toast: toast
        }
      };
    });
  } catch (error) {
    console.error(error);
    const toast = createToast(TOAST_MESSAGES.folderUpdateError, "error");

    setState(function editFailed(latest) {
      return {
        ...latest,
        ui: {
          ...latest.ui,
          formErrors: { editFolderName: TOAST_MESSAGES.folderUpdateError },
          toast: toast
        }
      };
    });
  }
}

function openDeleteFolderDialog(folderId) {
  const folder = getState().data.folders[folderId];

  if (!folder) {
    showToast(TOAST_MESSAGES.folderDeleteError, "error");
    return;
  }

  openDialog(DIALOG_KEYS.deleteFolder, {
    activeFolderId: folderId,
    activePromptId: null
  });
}

function submitDeleteFolder(typedName) {
  const current = getState();
  const folder = current.data.folders[current.ui.activeFolderId];

  if (!folder) {
    showToast(TOAST_MESSAGES.folderDeleteError, "error");
    return;
  }

  if (typedName !== folder.name) {
    const toast = createToast(TOAST_MESSAGES.folderNameMismatch, "error");

    setState(function mismatch(latest) {
      return {
        ...latest,
        ui: {
          ...latest.ui,
          formErrors: { deleteFolderName: TOAST_MESSAGES.folderNameMismatch },
          toast: toast
        }
      };
    });
    return;
  }

  try {
    api.deleteFolder({
      userId: String(current.user.id),
      folderId: String(folder.id)
    });

    const toast = createToast(TOAST_MESSAGES.folderDeleted, "success");

    setState(function removeFolder(latest) {
      const prompts = { ...latest.data.prompts };
      const listedIds = latest.data.folderPrompts[folder.id] || [];

      listedIds.forEach(function removeListed(id) {
        delete prompts[id];
      });

      Object.keys(prompts).forEach(function removeLinked(id) {
        if (prompts[id] && prompts[id].folderId === folder.id) {
          delete prompts[id];
        }
      });

      const folders = { ...latest.data.folders };
      delete folders[folder.id];

      const folderPrompts = { ...latest.data.folderPrompts };
      delete folderPrompts[folder.id];

      const expandedFolders = { ...latest.ui.expandedFolders };
      delete expandedFolders[folder.id];

      return {
        ...latest,
        data: {
          folders: folders,
          prompts: prompts,
          folderPrompts: folderPrompts
        },
        ui: {
          ...latest.ui,
          expandedFolders: expandedFolders,
          formErrors: {},
          activeFolderId: null,
          activePromptId: null,
          dialogs: closeDialogMap(latest.ui.dialogs),
          toast: toast
        }
      };
    });
  } catch (error) {
    console.error(error);
    showToast(TOAST_MESSAGES.folderDeleteError, "error");
  }
}

function toggleFolder(folderId) {
  setState(function toggle(current) {
    if (!current.data.folders[folderId]) {
      return current;
    }

    return {
      ...current,
      ui: {
        ...current.ui,
        expandedFolders: {
          ...current.ui.expandedFolders,
          [folderId]: !current.ui.expandedFolders[folderId]
        }
      }
    };
  });
}

function openCreatePromptDialog() {
  const current = getState();

  if (current.ui.loading) {
    return;
  }

  if (!canCreatePrompt(current)) {
    blockFreeLimit();
    return;
  }

  if (Object.keys(current.data.folders).length === 0) {
    showToast(FORM_MESSAGES.noFolderForPrompt, "error");
    openCreateFolderDialog();
    return;
  }

  openDialog(DIALOG_KEYS.prompt, {
    activeFolderId: null,
    activePromptId: null
  });
}

function submitCreatePrompt(fields) {
  const current = getState();

  if (!canCreatePrompt(current)) {
    closeDialogs();
    blockFreeLimit();
    return;
  }

  const validation = validatePromptFields(fields, current.data.folders);

  if (!validation.ok) {
    const toast = createToast(TOAST_MESSAGES.promptError, "error");

    setState(function invalidPrompt(latest) {
      return {
        ...latest,
        ui: {
          ...latest.ui,
          formErrors: {
            promptFolder: validation.errors.folder || "",
            promptName: validation.errors.nome || "",
            promptContent: validation.errors.conteudo || ""
          },
          toast: toast
        }
      };
    });
    return;
  }

  try {
    const prompt = createPromptRecord(validation.value, collectIds(current));

    api.createPrompt({
      userId: String(current.user.id),
      prompt: {
        id: String(prompt.id),
        folderId: String(prompt.folderId),
        nome: String(prompt.nome),
        conteudo: String(prompt.conteudo)
      }
    });

    const toast = createToast(TOAST_MESSAGES.promptCreated, "success");

    setState(function addPrompt(latest) {
      if (!isPremiumUser() && Object.keys(latest.data.prompts).length >= FREE_MAX_PROMPTS) {
        return latest;
      }

      const folderList = latest.data.folderPrompts[prompt.folderId] || [];

      return {
        ...latest,
        data: {
          ...latest.data,
          prompts: {
            ...latest.data.prompts,
            [prompt.id]: prompt
          },
          folderPrompts: {
            ...latest.data.folderPrompts,
            [prompt.folderId]: folderList.concat(prompt.id)
          }
        },
        ui: {
          ...latest.ui,
          formErrors: {},
          activeFolderId: null,
          activePromptId: null,
          expandedFolders: {
            ...latest.ui.expandedFolders,
            [prompt.folderId]: true
          },
          dialogs: closeDialogMap(latest.ui.dialogs),
          toast: toast
        }
      };
    });
  } catch (error) {
    console.error(error);
    const toast = createToast(TOAST_MESSAGES.promptError, "error");

    setState(function promptFailed(latest) {
      return {
        ...latest,
        ui: {
          ...latest.ui,
          formErrors: { promptContent: TOAST_MESSAGES.promptError },
          toast: toast
        }
      };
    });
  }
}

function openEditPromptDialog(promptId) {
  const prompt = getState().data.prompts[promptId];

  if (!prompt) {
    showToast(TOAST_MESSAGES.promptError, "error");
    return;
  }

  openDialog(DIALOG_KEYS.editPrompt, {
    activePromptId: promptId,
    activeFolderId: prompt.folderId
  });
}

function submitEditPrompt(fields) {
  const current = getState();
  const prompt = current.data.prompts[current.ui.activePromptId];

  if (!prompt) {
    showToast(TOAST_MESSAGES.promptError, "error");
    return;
  }

  const validation = validatePromptFields(fields, current.data.folders);

  if (!validation.ok) {
    const toast = createToast(TOAST_MESSAGES.promptError, "error");

    setState(function invalidEditPrompt(latest) {
      return {
        ...latest,
        ui: {
          ...latest.ui,
          formErrors: {
            editPromptFolder: validation.errors.folder || "",
            editPromptName: validation.errors.nome || "",
            editPromptContent: validation.errors.conteudo || ""
          },
          toast: toast
        }
      };
    });
    return;
  }

  try {
    const now = Date.now();
    const patch = validation.value;

    api.updatePrompt({
      userId: String(current.user.id),
      promptId: String(prompt.id),
      patch: {
        folderId: String(patch.folderId),
        nome: String(patch.nome),
        conteudo: String(patch.conteudo)
      }
    });

    const toast = createToast(TOAST_MESSAGES.promptUpdated, "success");

    setState(function updatePrompt(latest) {
      const existing = latest.data.prompts[prompt.id];

      if (!existing) {
        return latest;
      }

      const folderPrompts = { ...latest.data.folderPrompts };
      const previousFolderId = existing.folderId;

      if (previousFolderId !== patch.folderId) {
        folderPrompts[previousFolderId] = (folderPrompts[previousFolderId] || []).filter(function keep(id) {
          return id !== existing.id;
        });
        folderPrompts[patch.folderId] = (folderPrompts[patch.folderId] || []).concat(existing.id);
      }

      return {
        ...latest,
        data: {
          ...latest.data,
          prompts: {
            ...latest.data.prompts,
            [existing.id]: {
              ...existing,
              folderId: patch.folderId,
              nome: patch.nome,
              conteudo: patch.conteudo,
              updatedAt: now
            }
          },
          folderPrompts: folderPrompts
        },
        ui: {
          ...latest.ui,
          formErrors: {},
          activeFolderId: null,
          activePromptId: null,
          expandedFolders: {
            ...latest.ui.expandedFolders,
            [patch.folderId]: true
          },
          dialogs: closeDialogMap(latest.ui.dialogs),
          toast: toast
        }
      };
    });
  } catch (error) {
    console.error(error);
    const toast = createToast(TOAST_MESSAGES.promptError, "error");

    setState(function editPromptFailed(latest) {
      return {
        ...latest,
        ui: {
          ...latest.ui,
          formErrors: { editPromptContent: TOAST_MESSAGES.promptError },
          toast: toast
        }
      };
    });
  }
}

function openDeletePromptDialog(promptId) {
  const prompt = getState().data.prompts[promptId];

  if (!prompt) {
    showToast(TOAST_MESSAGES.promptError, "error");
    return;
  }

  openDialog(DIALOG_KEYS.deletePrompt, {
    activePromptId: promptId,
    activeFolderId: prompt.folderId
  });
}

function confirmDeletePrompt() {
  const current = getState();
  const prompt = current.data.prompts[current.ui.activePromptId];

  if (!prompt) {
    showToast(TOAST_MESSAGES.promptError, "error");
    return;
  }

  try {
    api.deletePrompt({
      userId: String(current.user.id),
      promptId: String(prompt.id)
    });

    const toast = createToast(TOAST_MESSAGES.promptDeleted, "success");

    setState(function removePrompt(latest) {
      const prompts = { ...latest.data.prompts };
      delete prompts[prompt.id];

      const folderPrompts = { ...latest.data.folderPrompts };
      const folderId = prompt.folderId;
      folderPrompts[folderId] = (folderPrompts[folderId] || []).filter(function keep(id) {
        return id !== prompt.id;
      });

      return {
        ...latest,
        data: {
          ...latest.data,
          prompts: prompts,
          folderPrompts: folderPrompts
        },
        ui: {
          ...latest.ui,
          formErrors: {},
          activeFolderId: null,
          activePromptId: null,
          dialogs: closeDialogMap(latest.ui.dialogs),
          toast: toast
        }
      };
    });
  } catch (error) {
    console.error(error);
    showToast(TOAST_MESSAGES.promptError, "error");
  }
}

async function copyPrompt(promptId) {
  const prompt = getState().data.prompts[promptId];

  if (!prompt) {
    showToast(TOAST_MESSAGES.shareError, "error");
    return;
  }

  try {
    const copied = await copyText(prompt.conteudo);
    showToast(copied ? TOAST_MESSAGES.shareSuccess : TOAST_MESSAGES.shareError, copied ? "success" : "error");
  } catch (error) {
    console.error(error);
    showToast(TOAST_MESSAGES.shareError, "error");
  }
}

async function exportFolder(folderId) {
  if (!isPremiumUser()) {
    requestPremium();
    return;
  }

  const current = getState();
  const folder = current.data.folders[folderId];

  if (!folder) {
    showToast(TOAST_MESSAGES.exportError, "error");
    return;
  }

  try {
    const prompts = (current.data.folderPrompts[folderId] || [])
      .map(function mapPrompt(id) {
        return current.data.prompts[id];
      })
      .filter(Boolean)
      .sort(function comparePrompts(a, b) {
        return a.nome.localeCompare(b.nome, "pt", { sensitivity: "base" });
      });

    const payload = buildExportPayload(folder, prompts);
    const json = JSON.stringify(payload, null, 2);
    const downloaded = downloadJsonFile(`${slugify(folder.name)}.json`, json);
    const copied = await copyText(json);

    if (!downloaded && !copied) {
      showToast(TOAST_MESSAGES.exportError, "error");
      return;
    }

    showToast(TOAST_MESSAGES.exportSuccess, "success");
  } catch (error) {
    console.error(error);
    showToast(TOAST_MESSAGES.exportError, "error");
  }
}

function openImportDialog() {
  if (!isPremiumUser()) {
    requestPremium();
    return;
  }

  openDialog(DIALOG_KEYS.import, {
    activeFolderId: null,
    activePromptId: null
  });
}

function openLicenseDialog() {
  openDialog(DIALOG_KEYS.license, {
    activeFolderId: null,
    activePromptId: null
  });
}

function submitLicense(licenseKey) {
  const key = String(licenseKey ?? "").trim();

  if (!key) {
    const toast = createToast(TOAST_MESSAGES.invalidKey, "error");

    setState(function missingKey(current) {
      return {
        ...current,
        ui: {
          ...current.ui,
          formErrors: { licenseKey: FORM_MESSAGES.licenseRequired },
          toast: toast
        }
      };
    });
    return;
  }

  try {
    const current = getState();

    api.activateLicenseKey({
      userId: String(current.user.id),
      licenseKey: key
    });

    const result = validateLicenseKey(key);

    if (!result.ok && result.reason === "error") {
      const toast = createToast(TOAST_MESSAGES.licenseError, "error");

      setState(function technicalFailure(latest) {
        return {
          ...latest,
          ui: {
            ...latest.ui,
            formErrors: { licenseKey: TOAST_MESSAGES.licenseError },
            toast: toast
          }
        };
      });
      return;
    }

    if (!result.ok) {
      const toast = createToast(TOAST_MESSAGES.invalidKey, "error");

      setState(function invalidKey(latest) {
        return {
          ...latest,
          ui: {
            ...latest.ui,
            formErrors: { licenseKey: TOAST_MESSAGES.invalidKey },
            toast: toast
          }
        };
      });
      return;
    }

    const licenseExpiry = Date.now() + PREMIUM_LICENSE_DURATION_DAYS * 24 * 60 * 60 * 1000;
    const toast = createToast(`${TOAST_MESSAGES.premiumActivated} ${formatPlanDate(licenseExpiry)}`, "success");

    setState(function activate(latest) {
      return {
        ...latest,
        user: {
          ...latest.user,
          plan: "premium",
          licenseKey: key,
          licenseExpiry: licenseExpiry,
          updatedAt: Date.now()
        },
        ui: {
          ...latest.ui,
          formErrors: {},
          activeFolderId: null,
          activePromptId: null,
          dialogs: closeDialogMap(latest.ui.dialogs),
          toast: toast
        }
      };
    });
  } catch (error) {
    console.error(error);
    const toast = createToast(TOAST_MESSAGES.licenseError, "error");

    setState(function licenseFailed(latest) {
      return {
        ...latest,
        ui: {
          ...latest.ui,
          formErrors: { licenseKey: TOAST_MESSAGES.licenseError },
          toast: toast
        }
      };
    });
  }
}

function submitImport(rawText) {
  if (!isPremiumUser()) {
    closeDialogs();
    requestPremium();
    return;
  }

  const parsed = parseImportPayload(rawText);

  if (!parsed.ok) {
    const message = parsed.reason === "empty" ? FORM_MESSAGES.importRequired : TOAST_MESSAGES.importError;
    const toast = createToast(TOAST_MESSAGES.importError, "error");

    setState(function invalidImport(current) {
      return {
        ...current,
        ui: {
          ...current.ui,
          formErrors: { importJson: message },
          toast: toast
        }
      };
    });
    return;
  }

  try {
    const current = getState();
    const now = Date.now();
    const usedIds = collectIds(current);
    const usedFolderNames = new Set(Object.values(current.data.folders).map(function readName(folder) {
      return folder.name;
    }));
    const usedPromptNames = new Set(Object.values(current.data.prompts).map(function readPromptName(prompt) {
      return prompt.nome;
    }));

    const folderId = allocateId(parsed.folder.id ? String(parsed.folder.id) : "", usedIds);
    const folderName = allocateName(parsed.folder.name, usedFolderNames);
    const folder = {
      id: folderId,
      name: folderName,
      createdAt: toTimestamp(parsed.folder.createdAt, now),
      updatedAt: toTimestamp(parsed.folder.updatedAt, now)
    };

    const importedPrompts = [];

    parsed.prompts.forEach(function mapImported(prompt) {
      const promptId = allocateId(prompt.id ? String(prompt.id) : "", usedIds);
      const nome = allocateName(prompt.nome, usedPromptNames);

      importedPrompts.push({
        id: promptId,
        folderId: folderId,
        nome: nome,
        conteudo: String(prompt.conteudo),
        createdAt: toTimestamp(prompt.createdAt, now),
        updatedAt: toTimestamp(prompt.updatedAt, now)
      });
    });

    api.createFolder({
      userId: String(current.user.id),
      folderId: String(folder.id),
      folderName: String(folder.name)
    });

    importedPrompts.forEach(function logPrompt(prompt) {
      api.createPrompt({
        userId: String(current.user.id),
        prompt: {
          id: String(prompt.id),
          folderId: String(prompt.folderId),
          nome: String(prompt.nome),
          conteudo: String(prompt.conteudo)
        }
      });
    });

    const toast = createToast(TOAST_MESSAGES.importSuccess, "success");

    setState(function applyImport(latest) {
      const prompts = { ...latest.data.prompts };
      const promptIds = [];

      importedPrompts.forEach(function addPrompt(prompt) {
        prompts[prompt.id] = prompt;
        promptIds.push(prompt.id);
      });

      return {
        ...latest,
        data: {
          ...latest.data,
          folders: {
            ...latest.data.folders,
            [folder.id]: folder
          },
          prompts: prompts,
          folderPrompts: {
            ...latest.data.folderPrompts,
            [folder.id]: promptIds
          }
        },
        ui: {
          ...latest.ui,
          formErrors: {},
          activeFolderId: null,
          activePromptId: null,
          expandedFolders: {
            ...latest.ui.expandedFolders,
            [folder.id]: true
          },
          dialogs: closeDialogMap(latest.ui.dialogs),
          toast: toast
        }
      };
    });
  } catch (error) {
    console.error(error);
    const toast = createToast(TOAST_MESSAGES.importError, "error");

    setState(function importFailed(latest) {
      return {
        ...latest,
        ui: {
          ...latest.ui,
          formErrors: { importJson: TOAST_MESSAGES.importError },
          toast: toast
        }
      };
    });
  }
}

export {
  initializeApp,
  closeDialogs,
  openCreateFolderDialog,
  submitCreateFolder,
  openEditFolderDialog,
  submitEditFolder,
  openDeleteFolderDialog,
  submitDeleteFolder,
  toggleFolder,
  openCreatePromptDialog,
  submitCreatePrompt,
  openEditPromptDialog,
  submitEditPrompt,
  openDeletePromptDialog,
  confirmDeletePrompt,
  copyPrompt,
  exportFolder,
  openImportDialog,
  openLicenseDialog,
  submitLicense,
  submitImport
};
