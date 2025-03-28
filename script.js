let tokenClient;
let accessToken = null;
let rootFolderId = null;
let currentFolderId = null;
let currentSKU = "";

const SCOPES = "https://www.googleapis.com/auth/drive.file";

function init() {
  gapi.load("client", async () => {
    await gapi.client.init({
      apiKey: CONFIG.API_KEY,
      discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
    });

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: SCOPES,
      callback: (tokenResponse) => {
        accessToken = tokenResponse.access_token;
        sessionStorage.setItem("access_token", accessToken);
        onLoginSuccess();
      },
    });

    const savedToken = sessionStorage.getItem("access_token");
    if (savedToken) {
      accessToken = savedToken;
      try {
        await gapi.client.drive.files.list({ pageSize: 1 });
        onLoginSuccess();
      } catch (err) {
        logout();
      }
    }
  });

  document.getElementById("login").onclick = () => {
    tokenClient.requestAccessToken({ prompt: "consent" });
  };

  document.getElementById("logout").onclick = logout;
  document.getElementById("logout2").onclick = logout;
  document.getElementById("dark-toggle").onclick = toggleDarkMode;
  document.getElementById("download-all").onclick = downloadAllPhotos;

  document.getElementById("search-btn").onclick = async () => {
    const sku = document.getElementById("sku-input").value.trim();
    if (!sku) return alert("Enter a SKU.");
    currentSKU = sku;
    currentFolderId = await getOrCreateSKUFolder(sku);
    showFolderView(currentSKU, currentFolderId);
  };

  document.getElementById("back-btn").onclick = () => {
    document.getElementById("folderView").style.display = "none";
    document.getElementById("home").style.display = "block";
    loadFolderList();
  };

  // Apply saved dark mode
  if (localStorage.getItem("darkMode") === "true") {
    document.body.classList.add("dark-mode");
  }
}

function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
}

function logout() {
  accessToken = null;
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("rootFolderId");
  location.reload();
}

function onLoginSuccess() {
  document.getElementById("auth").style.display = "none";
  document.getElementById("home").style.display = "block";
  getOrCreateRootFolder().then(loadFolderList);
}

async function getOrCreateRootFolder() {
  const cached = sessionStorage.getItem("rootFolderId");
  if (cached) {
    rootFolderId = cached;
    return;
  }

  const res = await gapi.client.drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder' and name='Amazon Product Photos' and trashed=false",
    fields: "files(id)",
  });

  if (res.result.files.length > 0) {
    rootFolderId = res.result.files[0].id;
  } else {
    const createRes = await gapi.client.drive.files.create({
      resource: {
        name: "Amazon Product Photos",
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });
    rootFolderId = createRes.result.id;
  }

  sessionStorage.setItem("rootFolderId", rootFolderId);
}

async function loadFolderList() {
  await getOrCreateRootFolder();
  const folderList = document.getElementById("folder-list");
  folderList.innerHTML = "";

  const res = await gapi.client.drive.files.list({
    q: `'${rootFolderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
    fields: "files(id, name)",
  });

  for (const folder of res.result.files) {
    const count = await getPhotoCount(folder.id);
    const thumbnailLink = await getLastPhotoThumbnail(folder.id);

    const div = document.createElement("div");
    div.className = "folder-item";

    if (thumbnailLink) {
      const thumb = document.createElement("img");
      thumb.className = "folder-thumbnail";
      thumb.src = thumbnailLink;
      div.appendChild(thumb);
    }

    const nameDiv = document.createElement("div");
    nameDiv.className = "folder-name";
    nameDiv.textContent = folder.name;
    div.appendChild(nameDiv);

    const countDiv = document.createElement("div");
    countDiv.className = "folder-count";
    countDiv.textContent = `${count} photo${count !== 1 ? "s" : ""}`;
    div.appendChild(countDiv);

    const actions = document.createElement("div");
    actions.className = "folder-actions";

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "✏️";
    renameBtn.title = "Rename";
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      const newName = prompt("Enter new folder name:", folder.name);
      if (newName && newName !== folder.name) {
        gapi.client.drive.files.update({
          fileId: folder.id,
          resource: { name: newName },
        }).then(() => loadFolderList());
      }
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.title = "Delete folder";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete folder "${folder.name}" and all its photos?`)) {
        gapi.client.drive.files.delete({ fileId: folder.id }).then(() => loadFolderList());
      }
    };

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);
    div.appendChild(actions);

    div.onclick = () => {
      currentSKU = folder.name;
      currentFolderId = folder.id;
      showFolderView(currentSKU, currentFolderId);
    };

    folderList.appendChild(div);
  }
}

async function getLastPhotoThumbnail(folderId) {
  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType contains 'image/'`,
    orderBy: "createdTime desc",
    fields: "files(id, thumbnailLink)",
    pageSize: 1,
  });

  const photo = res.result.files[0];
  return photo ? (photo.thumbnailLink || `https://drive.google.com/uc?export=view&id=${photo.id}`) : null;
}

async function getPhotoCount(folderId) {
  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType contains 'image/'`,
    fields: "files(id)",
  });
  return res.result.files.length;
}

async function getOrCreateSKUFolder(sku) {
  await getOrCreateRootFolder();
  const res = await gapi.client.drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${sku}' and '${rootFolderId}' in parents and trashed=false`,
    fields: "files(id)",
  });

  if (res.result.files.length > 0) {
    return res.result.files[0].id;
  } else {
    const createRes = await gapi.client.drive.files.create({
      resource: {
        name: sku,
        mimeType: "application/vnd.google-apps.folder",
        parents: [rootFolderId],
      },
      fields: "id",
    });
    return createRes.result.id;
  }
}

function showFolderView(sku, folderId) {
  document.getElementById("home").style.display = "none";
  document.getElementById("folderView").style.display = "block";
  document.getElementById("folder-name-label").textContent = sku;
  loadFolderImages(folderId);
}

async function loadFolderImages(folderId) {
  const grid = document.getElementById("preview-grid");
  const countElem = document.getElementById("photo-count");
  grid.innerHTML = "";

  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType contains 'image/'`,
    fields: "files(id, name, thumbnailLink)",
  });

  const files = res.result.files;
  countElem.textContent = `${files.length} photo${files.length !== 1 ? "s" : ""} in this folder`;

  const addTile = document.createElement("div");
  addTile.className = "add-photos";
  addTile.textContent = "+";
  addTile.onclick = () => triggerPhotoCapture();
  grid.appendChild(addTile);

  for (const file of files) {
    const img = document.createElement("img");
    img.src = file.thumbnailLink || `https://drive.google.com/uc?export=view&id=${file.id}`;
    img.alt = file.name;
    img.title = "Tap to delete";
    img.onclick = () => {
      if (confirm(`Delete ${file.name}?`)) {
        deletePhoto(file.id, folderId);
      }
    };
    grid.appendChild(img);
  }
}

async function deletePhoto(fileId, folderId) {
  await gapi.client.drive.files.delete({ fileId });
  loadFolderImages(folderId);
  loadFolderList();
}

function triggerPhotoCapture() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.capture = "environment";

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentFolderId || !currentSKU) return;

    const grid = document.getElementById("preview-grid");

    const placeholder = document.createElement("div");
    placeholder.className = "uploading-placeholder";
    grid.appendChild(placeholder);

    const fileName = await getNextPhotoName(currentFolderId, currentSKU);
    const metadata = {
      name: fileName,
      parents: [currentFolderId],
      mimeType: file.type,
    };

    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", file);

    await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });

    loadFolderImages(currentFolderId);
    loadFolderList();
  };

  input.click();
}

async function getNextPhotoName(folderId, baseName) {
  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(name)",
  });

  const numbers = (res.result.files || [])
    .map(f => parseInt(f.name.replace(baseName, "").replace(/\D/g, ""), 10))
    .filter(n => !isNaN(n));

  const next = (Math.max(0, ...numbers) + 1).toString().padStart(4, "0");
  return `${baseName}${next}.jpg`;
}

async function downloadAllPhotos() {
  if (!currentFolderId) return;

  const res = await gapi.client.drive.files.list({
    q: `'${currentFolderId}' in parents and trashed=false and mimeType contains 'image/'`,
    fields: "files(id, name)",
  });

  for (const file of res.result.files) {
    const link = document.createElement("a");
    link.href = `https://drive.google.com/uc?export=download&id=${file.id}`;
    link.download = file.name;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

init();
