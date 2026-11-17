function enableSidePanel() {
  if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) {
    return;
  }

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function handleSidePanelError(error) {
    console.error("Não foi possível abrir o Prompt DRIVE pelo ícone da extensão", error);
  });
}

function handleInstalled() {
  enableSidePanel();
}

function handleStartup() {
  enableSidePanel();
}

chrome.runtime.onInstalled.addListener(handleInstalled);
chrome.runtime.onStartup.addListener(handleStartup);
