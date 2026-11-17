const listeners = new Set();

function createUserId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function replaceUuidChar(char) {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function createInitialState() {
  const now = Date.now();

  return {
    user: {
      id: createUserId(),
      plan: "free",
      createdAt: now,
      updatedAt: now
    },
    ui: {
      loading: true,
      error: null,
      dialogs: {
        folderDialogOpen: false,
        editFolderDialogOpen: false,
        promptDialogOpen: false,
        promptEditDialogOpen: false,
        confirmDeletePromptDialogOpen: false,
        deleteFolderDialogOpen: false,
        licenseDialogOpen: false,
        importDialogOpen: false
      },
      expandedFolders: {},
      formErrors: {},
      activeFolderId: null,
      activePromptId: null,
      toast: null
    },
    data: {
      folders: {},
      prompts: {},
      folderPrompts: {}
    }
  };
}

let state = createInitialState();

function getState() {
  return state;
}

function setState(partialOrRecipe) {
  const next = typeof partialOrRecipe === "function"
    ? partialOrRecipe(state)
    : mergeState(state, partialOrRecipe);

  if (!next) {
    console.error("setState ignorado: próximo estado vazio");
    return;
  }

  state = next;
  notifyListeners();
}

function mergeState(current, partial) {
  const partialUi = partial.ui || {};

  return {
    ...current,
    ...partial,
    user: {
      ...current.user,
      ...(partial.user || {})
    },
    ui: {
      ...current.ui,
      ...partialUi,
      dialogs: {
        ...current.ui.dialogs,
        ...(partialUi.dialogs || {})
      },
      expandedFolders: Object.prototype.hasOwnProperty.call(partialUi, "expandedFolders")
        ? partialUi.expandedFolders
        : current.ui.expandedFolders,
      formErrors: Object.prototype.hasOwnProperty.call(partialUi, "formErrors")
        ? partialUi.formErrors
        : current.ui.formErrors
    },
    data: {
      ...current.data,
      ...(partial.data || {})
    }
  };
}

function subscribe(listener) {
  listeners.add(listener);

  return function unsubscribeListener() {
    listeners.delete(listener);
  };
}

function unsubscribe(listener) {
  listeners.delete(listener);
}

function notifyListeners() {
  listeners.forEach(function notify(listener) {
    try {
      listener(state);
    } catch (error) {
      console.error("Falha ao atualizar a interface", error);
    }
  });
}

function getPromptCountTotal() {
  return Object.keys(state.data.prompts).length;
}

function isPremiumPlan(user) {
  if (!user || user.plan !== "premium") {
    return false;
  }

  if (typeof user.licenseExpiry === "number" && user.licenseExpiry <= Date.now()) {
    return false;
  }

  return true;
}

function isPremiumUser() {
  return isPremiumPlan(state.user);
}

const stateManager = {
  getState: getState,
  setState: setState,
  subscribe: subscribe,
  unsubscribe: unsubscribe,
  getPromptCountTotal: getPromptCountTotal,
  isPremiumUser: isPremiumUser
};

export {
  getState,
  setState,
  subscribe,
  unsubscribe,
  getPromptCountTotal,
  isPremiumPlan,
  isPremiumUser,
  stateManager
};
