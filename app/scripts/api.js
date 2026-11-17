function logAction(actionName, payload) {
  console.log(actionName, payload);
}

function createFolder(payload) {
  logAction("createFolder", payload);
}

function updateFolder(payload) {
  logAction("updateFolder", payload);
}

function deleteFolder(payload) {
  logAction("deleteFolder", payload);
}

function createPrompt(payload) {
  logAction("createPrompt", payload);
}

function updatePrompt(payload) {
  logAction("updatePrompt", payload);
}

function deletePrompt(payload) {
  logAction("deletePrompt", payload);
}

function activateLicenseKey(payload) {
  logAction("activateLicenseKey", payload);
}

export {
  createFolder,
  updateFolder,
  deleteFolder,
  createPrompt,
  updatePrompt,
  deletePrompt,
  activateLicenseKey
};
