import { GOD_KEY_TO_PREMIUM_ACTIVATE } from "./constants.js";

function generateId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function replaceUuidChar(char) {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function generateUniqueId(usedIds) {
  let id = generateId();
  const used = usedIds || new Set();

  while (used.has(id)) {
    id = generateId();
  }

  return id;
}

function cleanJsonText(text) {
  const cleanText = String(text ?? "").trim().replace(/^[\uFEFF\u200B-\u200D\u2060]+/g, "");
  return cleanText.trim();
}

function createFolderRecord(name, usedIds) {
  const now = Date.now();

  return {
    id: generateUniqueId(usedIds),
    name: name,
    createdAt: now,
    updatedAt: now
  };
}

function createPromptRecord(input, usedIds) {
  const now = Date.now();

  return {
    id: generateUniqueId(usedIds),
    folderId: input.folderId,
    nome: input.nome,
    conteudo: input.conteudo,
    createdAt: now,
    updatedAt: now
  };
}

function validateLicenseKey(licenseKey) {
  try {
    if (String(licenseKey ?? "").trim() === GOD_KEY_TO_PREMIUM_ACTIVATE) {
      return { ok: true };
    }

    return { ok: false, reason: "invalid" };
  } catch (error) {
    console.error("Falha técnica ao validar a serial key", error);
    return { ok: false, reason: "error" };
  }
}

function parseImportPayload(rawText) {
  const cleanText = cleanJsonText(rawText);

  if (!cleanText) {
    return { ok: false, reason: "empty" };
  }

  let data;

  try {
    data = JSON.parse(cleanText);
  } catch (error) {
    console.error("JSON de importação inválido", {
      sample: cleanText.slice(0, 200),
      firstCharCode: cleanText.charCodeAt(0),
      error: error
    });
    return { ok: false, reason: "invalid" };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "invalid" };
  }

  const folder = data.folder;

  if (!folder || typeof folder !== "object" || typeof folder.name !== "string" || !folder.name.trim()) {
    return { ok: false, reason: "invalid" };
  }

  if (!Array.isArray(data.prompts)) {
    return { ok: false, reason: "invalid" };
  }

  for (let index = 0; index < data.prompts.length; index += 1) {
    const prompt = data.prompts[index];

    if (!prompt || typeof prompt !== "object") {
      return { ok: false, reason: "invalid" };
    }

    if (typeof prompt.nome !== "string" || !prompt.nome.trim()) {
      return { ok: false, reason: "invalid" };
    }

    if (typeof prompt.conteudo !== "string" || !prompt.conteudo.trim()) {
      return { ok: false, reason: "invalid" };
    }
  }

  return {
    ok: true,
    folder: folder,
    prompts: data.prompts
  };
}

function buildExportPayload(folder, prompts) {
  return {
    folder: {
      id: String(folder.id),
      name: String(folder.name),
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt
    },
    prompts: prompts.map(function mapPrompt(prompt) {
      return {
        id: String(prompt.id),
        folderId: String(folder.id),
        nome: String(prompt.nome),
        conteudo: String(prompt.conteudo),
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt
      };
    })
  };
}

function allocateName(desiredName, usedNames) {
  const base = String(desiredName ?? "").trim();

  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }

  let index = 1;
  let candidate = `${base} (${index})`;

  while (usedNames.has(candidate)) {
    index += 1;
    candidate = `${base} (${index})`;
  }

  usedNames.add(candidate);
  return candidate;
}

function allocateId(preferredId, usedIds) {
  if (typeof preferredId === "string" && preferredId.trim() && !usedIds.has(preferredId)) {
    usedIds.add(preferredId);
    return preferredId;
  }

  const id = generateUniqueId(usedIds);
  usedIds.add(id);
  return id;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.error("Clipboard API indisponível", error);
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch (error) {
    console.error("Falha ao copiar texto", error);
    return false;
  }
}

function slugify(name) {
  const slug = String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return slug || "pasta";
}

function downloadJsonFile(filename, json) {
  try {
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error("Falha ao baixar JSON", error);
    return false;
  }
}

function openUrl(url) {
  if (globalThis.chrome && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url: url }).catch(function handleOpenError(error) {
      console.error("Não foi possível abrir a página pelo Chrome", error);
      globalThis.open(url, "_blank", "noopener,noreferrer");
    });
    return;
  }

  globalThis.open(url, "_blank", "noopener,noreferrer");
}

async function readFileAsText(file) {
  const text = await file.text();
  return cleanJsonText(text);
}

function toTimestamp(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export {
  generateId,
  generateUniqueId,
  cleanJsonText,
  createFolderRecord,
  createPromptRecord,
  validateLicenseKey,
  parseImportPayload,
  buildExportPayload,
  allocateName,
  allocateId,
  copyText,
  slugify,
  downloadJsonFile,
  openUrl,
  readFileAsText,
  toTimestamp
};
