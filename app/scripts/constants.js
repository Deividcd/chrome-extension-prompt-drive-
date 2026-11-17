export const GOD_KEY_TO_PREMIUM_ACTIVATE = "Kjajhist#@123";
export const FREE_MAX_PROMPTS = 5;
export const PREMIUM_LICENSE_DURATION_DAYS = 30;
export const SALES_LANDING_PAGE_URL = "https://www.sample.com";
export const PREVIEW_LENGTH = 100;
export const TOAST_DURATION_MS = 3400;

export const SEED_PATHS = ["./data/seed.json", "/data/seed.json", "data/seed.json"];

export const DOM_IDS = {
  btnCreateFolder: "#btnCreateFolder",
  btnCreatePrompt: "#btnCreatePrompt",
  btnLicenseKey: "#btnLicenseKey",
  btnImportFolder: "#btnImportFolder",
  promptCounter: "#promptCounter",
  userPlanBadge: "#userPlanBadge",
  folderDialog: "#folderDialog",
  promptDialog: "#promptDialog",
  promptEditDialog: "#promptEditDialog",
  confirmDeletePromptDialog: "#confirmDeletePromptDialog",
  deleteFolderDialog: "#deleteFolderDialog",
  editFolderDialog: "#editFolderDialog",
  licenseDialog: "#licenseDialog",
  importDialog: "#importDialog",
  foldersContainer: "#foldersContainer",
  mainContent: "#mainContent"
};

export const TOAST_MESSAGES = {
  folderCreated: "Pasta criada com sucesso",
  folderUpdated: "Pasta atualizada com sucesso",
  folderError: "Erro ao criar pasta",
  folderUpdateError: "Erro ao atualizar pasta",
  promptCreated: "Prompt criado com sucesso",
  promptUpdated: "Prompt atualizado com sucesso",
  promptDeleted: "Prompt removido com sucesso",
  promptError: "Erro ao processar prompt",
  folderDeleted: "Pasta removida com sucesso",
  folderDeleteError: "Erro ao remover pasta",
  folderNameMismatch: "O nome digitado não confere com o nome da pasta",
  limitReached: "Limite do plano Free atingido (5 prompts)",
  premiumActivated: "Premium ativado até",
  invalidKey: "Chave inválida",
  licenseError: "Não foi possível validar a chave. Tente novamente.",
  premiumFeature: "Recurso Premium - Ative o Premium para usar esta funcionalidade",
  shareSuccess: "Prompt copiado para a área de transferência!",
  shareError: "Falha ao compartilhar prompt",
  exportSuccess: "Pasta exportada com sucesso!",
  exportError: "Erro ao exportar pasta",
  importSuccess: "Importação concluída com sucesso",
  importError: "Erro ao importar pasta - verifique o formato do JSON",
  seedError: "Não foi possível carregar os prompts. Tente novamente."
};

export const FORM_MESSAGES = {
  folderNameRequired: "Informe o nome da pasta",
  promptNameRequired: "Informe o nome do prompt",
  promptContentRequired: "Informe o conteúdo do prompt",
  folderRequired: "Selecione uma pasta",
  licenseRequired: "Informe a serial key",
  importRequired: "Informe um JSON para importar",
  noFolderForPrompt: "Crie uma pasta antes de adicionar um prompt"
};

export const DIALOG_KEYS = {
  folder: "folderDialogOpen",
  editFolder: "editFolderDialogOpen",
  prompt: "promptDialogOpen",
  editPrompt: "promptEditDialogOpen",
  deletePrompt: "confirmDeletePromptDialogOpen",
  deleteFolder: "deleteFolderDialogOpen",
  license: "licenseDialogOpen",
  import: "importDialogOpen"
};
