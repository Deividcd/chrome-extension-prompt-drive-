import {
  DOM_IDS,
  FREE_MAX_PROMPTS,
  PREVIEW_LENGTH
} from "./constants.js";
import {
  closeDialogs,
  confirmDeletePrompt,
  copyPrompt,
  exportFolder,
  initializeApp,
  openCreateFolderDialog,
  openCreatePromptDialog,
  openDeleteFolderDialog,
  openDeletePromptDialog,
  openEditFolderDialog,
  openEditPromptDialog,
  openImportDialog,
  openLicenseDialog,
  submitCreateFolder,
  submitCreatePrompt,
  submitDeleteFolder,
  submitEditFolder,
  submitEditPrompt,
  submitImport,
  submitLicense,
  toggleFolder
} from "./engine.js";
import { readFileAsText } from "./service.js";
import { getState, isPremiumPlan, subscribe } from "./states.js";

let started = false;
let previousSignature = "";
let previousDialogs = null;
let previousErrors = "";
let folderFocus = null;
let dialogInvoker = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function icon(paths) {
  return `<svg class="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">${paths}</svg>`;
}

const ICONS = {
  folder: icon('<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-10z"/>'),
  chevron: icon('<path d="M9 6.5 15 12l-6 5.5"/>'),
  copy: icon('<rect x="9" y="9" width="10" height="10" rx="2"/><path d="M6 15.5V6.5A1.5 1.5 0 0 1 7.5 5H15"/>'),
  edit: icon('<path d="M4 20h4l11-11-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>'),
  trash: icon('<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M7.5 7l1 13h7l1-13"/>'),
  download: icon('<path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 20h14"/>')
};

function requireElement(selector) {
  const element = document.querySelector(selector);

  if (!element) {
    throw new Error(`Elemento não encontrado: ${selector}`);
  }

  return element;
}

function buildPreview(content) {
  const singleLine = String(content ?? "").replace(/\s+/g, " ").trim();

  if (singleLine.length <= PREVIEW_LENGTH) {
    return singleLine;
  }

  return `${singleLine.slice(0, PREVIEW_LENGTH)}...`;
}

function sortFolders(folders) {
  return folders.sort(function compareFolders(a, b) {
    return a.createdAt - b.createdAt || a.name.localeCompare(b.name, "pt", { sensitivity: "base" });
  });
}

function sortPrompts(prompts) {
  return prompts.sort(function comparePrompts(a, b) {
    return a.nome.localeCompare(b.nome, "pt", { sensitivity: "base" });
  });
}

function createViewSignature(state) {
  return JSON.stringify({
    premium: isPremiumPlan(state.user),
    expanded: state.ui.expandedFolders,
    folders: state.data.folders,
    prompts: state.data.prompts,
    folderPrompts: state.data.folderPrompts
  });
}

function formatPlanDate(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(timestamp));
}

function renderChrome(state) {
  const premium = isPremiumPlan(state.user);
  const count = Object.keys(state.data.prompts).length;
  const app = requireElement("#app");
  const counter = requireElement(DOM_IDS.promptCounter);
  const badge = requireElement(DOM_IDS.userPlanBadge);
  const importButton = requireElement(DOM_IDS.btnImportFolder);

  app.dataset.plan = premium ? "premium" : "free";
  app.classList.toggle("app--loading", state.ui.loading);

  counter.textContent = premium ? `${count} / ∞` : `${count} / ${FREE_MAX_PROMPTS}`;
  counter.setAttribute("aria-label", premium
    ? `${count} prompts, plano ilimitado`
    : `${count} de ${FREE_MAX_PROMPTS} prompts`);
  counter.classList.toggle("counter--premium", premium);

  badge.textContent = premium ? "Premium" : "Free";
  badge.classList.toggle("plan-badge--premium", premium);
  badge.classList.toggle("plan-badge--free", !premium);

  const badgeLabel = premium && state.user.licenseExpiry
    ? `Premium ativo até ${formatPlanDate(state.user.licenseExpiry)}`
    : "Plano Free";
  badge.title = badgeLabel;
  badge.setAttribute("aria-label", badgeLabel);

  importButton.hidden = !premium;
  importButton.setAttribute("aria-hidden", premium ? "false" : "true");
  importButton.tabIndex = premium ? 0 : -1;
}

function renderStatus(state) {
  const loading = requireElement("#loadingState");
  const error = requireElement("#errorState");
  const empty = requireElement("#emptyState");
  const folders = requireElement(DOM_IDS.foldersContainer);
  const errorMessage = requireElement("#errorMessage");
  const folderCount = Object.keys(state.data.folders).length;

  loading.hidden = !state.ui.loading;
  error.hidden = state.ui.loading || !state.ui.error;
  empty.hidden = state.ui.loading || Boolean(state.ui.error) || folderCount > 0;
  folders.hidden = state.ui.loading || Boolean(state.ui.error) || folderCount === 0;

  if (state.ui.error) {
    errorMessage.textContent = state.ui.error.message;
  }
}

function renderPrompt(prompt) {
  const preview = buildPreview(prompt.conteudo);

  return `
    <li class="prompt" data-testid="prompt" data-prompt-id="${escapeHtml(prompt.id)}">
      <div class="prompt__body">
        <p class="prompt__name">${escapeHtml(prompt.nome)}</p>
        <p class="prompt__preview" title="${escapeHtml(prompt.conteudo)}">${escapeHtml(preview)}</p>
      </div>
      <div class="prompt__actions">
        <button type="button" class="icon-button" data-action="copy-prompt" data-prompt-id="${escapeHtml(prompt.id)}" aria-label="Copiar prompt" title="Copiar prompt">${ICONS.copy}</button>
        <button type="button" class="icon-button" data-action="edit-prompt" data-prompt-id="${escapeHtml(prompt.id)}" aria-label="Editar prompt" title="Editar prompt">${ICONS.edit}</button>
        <button type="button" class="icon-button icon-button--danger" data-action="delete-prompt" data-prompt-id="${escapeHtml(prompt.id)}" aria-label="Excluir prompt" title="Excluir prompt">${ICONS.trash}</button>
      </div>
    </li>
  `;
}

function renderFolder(folder, state, premium) {
  const expanded = Boolean(state.ui.expandedFolders[folder.id]);
  const prompts = sortPrompts((state.data.folderPrompts[folder.id] || [])
    .map(function toPrompt(id) {
      return state.data.prompts[id];
    })
    .filter(Boolean));
  const count = prompts.length;
  const exportButton = premium
    ? `<button type="button" class="icon-button" data-action="export-folder" data-folder-id="${escapeHtml(folder.id)}" aria-label="Exportar pasta" title="Exportar pasta">${ICONS.download}</button>`
    : "";
  const body = expanded
    ? `<div class="folder__prompts" id="prompts-${escapeHtml(folder.id)}">${prompts.length
      ? `<ul class="prompt-list">${prompts.map(renderPrompt).join("")}</ul>`
      : `<p class="folder__empty">Esta pasta não tem prompts.</p>`}</div>`
    : `<div class="folder__prompts" id="prompts-${escapeHtml(folder.id)}" hidden></div>`;

  return `
    <article class="folder${expanded ? " folder--expanded" : ""}" data-testid="folder" data-folder-id="${escapeHtml(folder.id)}">
      <div class="folder__row">
        <button type="button" class="folder__toggle" data-action="toggle-folder" data-folder-id="${escapeHtml(folder.id)}" aria-expanded="${expanded ? "true" : "false"}" aria-controls="prompts-${escapeHtml(folder.id)}">
          <span class="folder__chevron">${ICONS.chevron}</span>
          <span class="folder__glyph">${ICONS.folder}</span>
          <span class="folder__name">${escapeHtml(folder.name)}</span>
          <span class="folder__count">${count}<span class="visually-hidden"> ${count === 1 ? "prompt" : "prompts"}</span></span>
        </button>
        <div class="folder__actions">
          ${exportButton}
          <button type="button" class="icon-button" data-action="edit-folder" data-folder-id="${escapeHtml(folder.id)}" aria-label="Editar pasta" title="Editar pasta">${ICONS.edit}</button>
          <button type="button" class="icon-button icon-button--danger" data-action="delete-folder" data-folder-id="${escapeHtml(folder.id)}" aria-label="Excluir pasta" title="Excluir pasta">${ICONS.trash}</button>
        </div>
      </div>
      ${body}
    </article>
  `;
}

function restoreFolderFocus() {
  if (!folderFocus) {
    return;
  }

  const selector = `[data-action="${CSS.escape(folderFocus.action)}"][data-folder-id="${CSS.escape(folderFocus.folderId)}"]`;
  const target = document.querySelector(selector);

  if (target) {
    target.focus();
  }

  folderFocus = null;
}

function renderFolders(state) {
  const container = requireElement(DOM_IDS.foldersContainer);
  const premium = isPremiumPlan(state.user);
  const folders = sortFolders(Object.values(state.data.folders));

  container.innerHTML = folders.map(function mapFolder(folder) {
    return renderFolder(folder, state, premium);
  }).join("");

  restoreFolderFocus();
}

function fillFolderSelect(select, folders, selectedId) {
  const sorted = sortFolders(folders.slice());
  const options = ['<option value="">Selecione uma pasta</option>'];

  sorted.forEach(function addOption(folder) {
    const selected = folder.id === selectedId ? " selected" : "";
    options.push(`<option value="${escapeHtml(folder.id)}"${selected}>${escapeHtml(folder.name)}</option>`);
  });

  select.innerHTML = options.join("");
}

function focusElement(selector) {
  const element = document.querySelector(selector);

  if (element) {
    element.focus();
  }
}

function wasDialogOpen(key) {
  return Boolean(previousDialogs && previousDialogs[key]);
}

function renderDialogs(state) {
  const dialogs = state.ui.dialogs;
  const entries = [
    { id: DOM_IDS.folderDialog, open: dialogs.folderDialogOpen, key: "folderDialogOpen", focus: "#folderNameInput" },
    { id: DOM_IDS.editFolderDialog, open: dialogs.editFolderDialogOpen, key: "editFolderDialogOpen", focus: "#editFolderNameInput" },
    { id: DOM_IDS.promptDialog, open: dialogs.promptDialogOpen, key: "promptDialogOpen", focus: "#promptFolderSelect" },
    { id: DOM_IDS.promptEditDialog, open: dialogs.promptEditDialogOpen, key: "promptEditDialogOpen", focus: "#editPromptNameInput" },
    { id: DOM_IDS.confirmDeletePromptDialog, open: dialogs.confirmDeletePromptDialogOpen, key: "confirmDeletePromptDialogOpen", focus: "#btnConfirmDeletePrompt" },
    { id: DOM_IDS.deleteFolderDialog, open: dialogs.deleteFolderDialogOpen, key: "deleteFolderDialogOpen", focus: "#deleteFolderInput" },
    { id: DOM_IDS.licenseDialog, open: dialogs.licenseDialogOpen, key: "licenseDialogOpen", focus: "#licenseKeyInput" },
    { id: DOM_IDS.importDialog, open: dialogs.importDialogOpen, key: "importDialogOpen", focus: "#importJsonInput" }
  ];

  const anyOpen = entries.some(function isOpen(entry) {
    return entry.open;
  });
  const wasAnyOpen = previousDialogs
    ? Object.keys(previousDialogs).some(function wasOpen(key) {
      return previousDialogs[key];
    })
    : false;

  entries.forEach(function syncDialog(entry) {
    const dialog = requireElement(entry.id);
    const opening = entry.open && !wasDialogOpen(entry.key);

    dialog.hidden = !entry.open;

    if (!opening) {
      return;
    }

    if (entry.key === "folderDialogOpen") {
      requireElement("#folderNameInput").value = "";
    }

    if (entry.key === "editFolderDialogOpen") {
      const folder = state.data.folders[state.ui.activeFolderId];
      requireElement("#editFolderNameInput").value = folder ? folder.name : "";
    }

    if (entry.key === "promptDialogOpen") {
      requireElement("#promptNameInput").value = "";
      requireElement("#promptContentInput").value = "";
      fillFolderSelect(requireElement("#promptFolderSelect"), Object.values(state.data.folders), "");
    }

    if (entry.key === "promptEditDialogOpen") {
      const prompt = state.data.prompts[state.ui.activePromptId];
      requireElement("#editPromptNameInput").value = prompt ? prompt.nome : "";
      requireElement("#editPromptContentInput").value = prompt ? prompt.conteudo : "";
      fillFolderSelect(
        requireElement("#editPromptFolderSelect"),
        Object.values(state.data.folders),
        prompt ? prompt.folderId : ""
      );
    }

    if (entry.key === "deleteFolderDialogOpen") {
      requireElement("#deleteFolderInput").value = "";
    }

    if (entry.key === "licenseDialogOpen") {
      requireElement("#licenseKeyInput").value = "";
    }

    if (entry.key === "importDialogOpen") {
      requireElement("#importJsonInput").value = "";
      requireElement("#importFileInput").value = "";
    }

    focusElement(entry.focus);
  });

  const deletePromptName = requireElement("#deletePromptName");
  const deleteFolderName = requireElement("#deleteFolderName");

  if (dialogs.confirmDeletePromptDialogOpen) {
    const prompt = state.data.prompts[state.ui.activePromptId];
    deletePromptName.textContent = prompt ? prompt.nome : "";
  }

  if (dialogs.deleteFolderDialogOpen) {
    const folder = state.data.folders[state.ui.activeFolderId];
    deleteFolderName.textContent = folder ? folder.name : "";
  }

  requireElement("#app").classList.toggle("app--dialog", anyOpen);
  document.querySelector(".header")?.toggleAttribute("inert", anyOpen);
  document.querySelector(".main")?.toggleAttribute("inert", anyOpen);
  document.querySelector(".footer")?.toggleAttribute("inert", anyOpen);

  if (!anyOpen && wasAnyOpen && dialogInvoker && dialogInvoker.isConnected) {
    dialogInvoker.focus();
    dialogInvoker = null;
  }

  if (anyOpen) {
    return;
  }

  dialogInvoker = null;
}

function syncFieldError(inputSelector, errorSelector, message) {
  const input = document.querySelector(inputSelector);
  const error = document.querySelector(errorSelector);

  if (!input || !error) {
    return;
  }

  const hintId = input.dataset.hint || "";

  if (message) {
    error.hidden = false;
    error.textContent = message;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", hintId ? `${error.id} ${hintId}` : error.id);
    return;
  }

  error.hidden = true;
  error.textContent = "";
  input.removeAttribute("aria-invalid");

  if (hintId) {
    input.setAttribute("aria-describedby", hintId);
    return;
  }

  input.removeAttribute("aria-describedby");
}

function renderErrors(state) {
  const errors = state.ui.formErrors || {};

  syncFieldError("#folderNameInput", "#folderNameError", errors.folderName);
  syncFieldError("#editFolderNameInput", "#editFolderNameError", errors.editFolderName);
  syncFieldError("#promptFolderSelect", "#promptFolderError", errors.promptFolder);
  syncFieldError("#promptNameInput", "#promptNameError", errors.promptName);
  syncFieldError("#promptContentInput", "#promptContentError", errors.promptContent);
  syncFieldError("#editPromptFolderSelect", "#editPromptFolderError", errors.editPromptFolder);
  syncFieldError("#editPromptNameInput", "#editPromptNameError", errors.editPromptName);
  syncFieldError("#editPromptContentInput", "#editPromptContentError", errors.editPromptContent);
  syncFieldError("#deleteFolderInput", "#deleteFolderError", errors.deleteFolderName);
  syncFieldError("#licenseKeyInput", "#licenseKeyError", errors.licenseKey);
  syncFieldError("#importJsonInput", "#importError", errors.importJson);
}

function renderToast(state) {
  const region = requireElement("#toastRegion");
  const toast = state.ui.toast;

  if (!toast) {
    region.innerHTML = "";
    delete region.dataset.toastId;
    return;
  }

  if (region.dataset.toastId === toast.id) {
    return;
  }

  const variant = toast.variant === "error" || toast.variant === "success" ? toast.variant : "info";
  region.dataset.toastId = toast.id;
  region.innerHTML = `<div class="toast toast--${variant}" role="status">${escapeHtml(toast.message)}</div>`;
}

function focusInvalidField(state) {
  const signature = JSON.stringify(state.ui.formErrors || {});

  if (signature === previousErrors) {
    return;
  }

  previousErrors = signature;
  const invalid = document.querySelector(".dialog:not([hidden]) [aria-invalid='true']");

  if (invalid) {
    invalid.focus();
  }
}

function render(state) {
  renderChrome(state);
  renderStatus(state);

  const signature = createViewSignature(state);

  if (signature !== previousSignature) {
    renderFolders(state);
    previousSignature = signature;
  }

  renderDialogs(state);
  renderErrors(state);
  renderToast(state);
  focusInvalidField(state);
  previousDialogs = { ...state.ui.dialogs };
}

function rememberInvoker(element) {
  dialogInvoker = element || document.activeElement;
}

function handleCreateFolderClick(event) {
  rememberInvoker(event.currentTarget);
  openCreateFolderDialog();
}

function handleCreatePromptClick(event) {
  rememberInvoker(event.currentTarget);
  openCreatePromptDialog();
}

function handleLicenseClick(event) {
  rememberInvoker(event.currentTarget);
  openLicenseDialog();
}

function handleImportClick(event) {
  rememberInvoker(event.currentTarget);
  openImportDialog();
}

function handleRetryClick() {
  initializeApp();
}

function handleFolderSubmit(event) {
  event.preventDefault();
  submitCreateFolder(requireElement("#folderNameInput").value);
}

function handleEditFolderSubmit(event) {
  event.preventDefault();
  submitEditFolder(requireElement("#editFolderNameInput").value);
}

function handlePromptSubmit(event) {
  event.preventDefault();
  submitCreatePrompt({
    folderId: requireElement("#promptFolderSelect").value,
    nome: requireElement("#promptNameInput").value,
    conteudo: requireElement("#promptContentInput").value
  });
}

function handleEditPromptSubmit(event) {
  event.preventDefault();
  submitEditPrompt({
    folderId: requireElement("#editPromptFolderSelect").value,
    nome: requireElement("#editPromptNameInput").value,
    conteudo: requireElement("#editPromptContentInput").value
  });
}

function handleDeletePromptSubmit(event) {
  event.preventDefault();
  confirmDeletePrompt();
}

function handleDeleteFolderSubmit(event) {
  event.preventDefault();
  submitDeleteFolder(requireElement("#deleteFolderInput").value);
}

function handleLicenseSubmit(event) {
  event.preventDefault();
  submitLicense(requireElement("#licenseKeyInput").value);
}

function handleImportSubmit(event) {
  event.preventDefault();
  submitImport(requireElement("#importJsonInput").value);
}

async function handleImportFileChange(event) {
  const file = event.target.files && event.target.files[0];

  if (!file) {
    return;
  }

  try {
    requireElement("#importJsonInput").value = await readFileAsText(file);
  } catch (error) {
    console.error(error);
    submitImport("");
  }
}

function handleFoldersClick(event) {
  const actionElement = event.target.closest("[data-action]");
  const container = requireElement(DOM_IDS.foldersContainer);

  if (!actionElement || !container.contains(actionElement)) {
    return;
  }

  const action = actionElement.dataset.action;
  const folderId = actionElement.dataset.folderId;
  const promptId = actionElement.dataset.promptId;

  if (action === "toggle-folder") {
    folderFocus = { action: action, folderId: folderId };
    toggleFolder(folderId);
    return;
  }

  rememberInvoker(actionElement);

  if (action === "edit-folder") {
    openEditFolderDialog(folderId);
    return;
  }

  if (action === "delete-folder") {
    openDeleteFolderDialog(folderId);
    return;
  }

  if (action === "export-folder") {
    exportFolder(folderId);
    return;
  }

  if (action === "copy-prompt") {
    copyPrompt(promptId);
    return;
  }

  if (action === "edit-prompt") {
    openEditPromptDialog(promptId);
    return;
  }

  if (action === "delete-prompt") {
    openDeletePromptDialog(promptId);
  }
}

function getFocusable(container) {
  return Array.from(container.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")).filter(function isVisible(element) {
    return !element.disabled && !element.hidden && element.tabIndex !== -1;
  });
}

function handleDocumentKeyDown(event) {
  const dialog = document.querySelector(".dialog:not([hidden])");

  if (event.key === "Escape" && dialog) {
    event.preventDefault();
    closeDialogs();
    return;
  }

  if (event.key !== "Tab" || !dialog) {
    return;
  }

  const panel = dialog.querySelector(".dialog__panel") || dialog;
  const items = getFocusable(panel);

  if (!items.length) {
    event.preventDefault();
    return;
  }

  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;

  if (!panel.contains(active)) {
    event.preventDefault();
    first.focus();
    return;
  }

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleDocumentClick(event) {
  const closer = event.target.closest("[data-action='close-dialog']");

  if (!closer) {
    return;
  }

  closeDialogs();
}

function bindEvents() {
  requireElement(DOM_IDS.btnCreateFolder).addEventListener("click", handleCreateFolderClick);
  requireElement(DOM_IDS.btnCreatePrompt).addEventListener("click", handleCreatePromptClick);
  requireElement(DOM_IDS.btnLicenseKey).addEventListener("click", handleLicenseClick);
  requireElement(DOM_IDS.btnImportFolder).addEventListener("click", handleImportClick);
  requireElement("#btnRetry").addEventListener("click", handleRetryClick);
  requireElement("#btnEmptyCreateFolder").addEventListener("click", handleCreateFolderClick);
  requireElement("#folderForm").addEventListener("submit", handleFolderSubmit);
  requireElement("#editFolderForm").addEventListener("submit", handleEditFolderSubmit);
  requireElement("#promptForm").addEventListener("submit", handlePromptSubmit);
  requireElement("#promptEditForm").addEventListener("submit", handleEditPromptSubmit);
  requireElement("#deletePromptForm").addEventListener("submit", handleDeletePromptSubmit);
  requireElement("#deleteFolderForm").addEventListener("submit", handleDeleteFolderSubmit);
  requireElement("#licenseForm").addEventListener("submit", handleLicenseSubmit);
  requireElement("#importForm").addEventListener("submit", handleImportSubmit);
  requireElement("#importFileInput").addEventListener("change", handleImportFileChange);
  requireElement(DOM_IDS.foldersContainer).addEventListener("click", handleFoldersClick);
  document.addEventListener("keydown", handleDocumentKeyDown);
  document.addEventListener("click", handleDocumentClick);
}

function startRenderer() {
  if (started) {
    return;
  }

  started = true;
  bindEvents();
  subscribe(render);
  render(getState());
}

export { startRenderer };
