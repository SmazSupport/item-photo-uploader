let tokenClient;
let accessToken = null;
let parentFolderId = null;
let currentFolderId = null;
let currentItemName = "";

const SCOPES = "https://www.googleapis.com/auth/drive.file";

function init() {
  gapi.load("client", async () => {
    await gapi.client.init({
      apiKey: CONFIG.API_KEY,
      discoveryDocs: [
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
      ],
    });

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: SCOPES,
      callback: (tokenResponse) => {
        accessToken = tokenResponse.access_token;
        sessionStorage.setItem("access_token", accessToken);
        document.getElementById("auth").style.display = "none";
        document.getElementById("main").style.display = "block";
        getOrCreateParentFolder();
      },
    });

    const savedToken = sessionStorage.getItem("access_token");
    if (savedToken) {
      accessToken = savedToken;
      document.getElementById("auth").style.display = "none";
      document.getElementById("main").style.display = "block";
      getOrCreateParentFolder();
    }
  });

  document.getElementById("login").onclick = () => {
    tokenClient.requestAccessToken({ prompt: "consent" });
  };

  document.getElementById("search-btn").onclick = async () => {
    const itemName = document.getElementById("item-name").value.trim();
    if (!itemName) return alert("Enter an item name.");
    currentItemName = itemName;
    currentFolderId = await getOrCreateItemFolder(itemName);
    loadFolderImages(currentFolderId);
  };

  document.getElementById("take-photo").onclick = () => {
    if (!currentFolderId || !currentItemName) {
      alert("Search or create an item folder first.");
      return;
    }
    takePhotoAndUpload(currentFolderId, currentItemName);
  };
}

async function getOrCreateParentFolder() {
  const res = await gapi.client.drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='Item Photos' and trashed=false`,
    fields: "files(id, name)",
  });

  if (res.result.files.length > 0) {
    parentFolderId = res.result.files[0].id;
  } else {
    const createRes = await gapi.client.drive.files.create({
      resource: {
        name: "Item Photos",
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });
    parentFolderId = createRes.result.id;
  }
}

async function getOrCreateItemFolder(itemName) {
  const res = await gapi.client.drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${itemName}' and '${parentFolderId}' in parents and trashed=false`,
    fields: "files(id, name)",
  });

  if (res.result.files.length > 0) {
    return res.result.files[0].id;
  } else {
    const createRes = await gapi.client.drive.files.create({
      resource: {
        name: itemName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId],
      },
      fields: "id",
    });
    return createRes.result.id;
  }
}

async function getNextPhotoName(folderId, baseName) {
  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(name)",
  });

  const numbers = res.result.files
    .map((f) => parseInt(f.name.replace(`${baseName}_`, "").replace(/\D/g, "")))
    .filter((n) => !isNaN(n));

  const next = (Math.max(0, ...numbers) + 1).toString().padStart(4, "0");
  return `${baseName}_${next}.jpg`;
}

function takePhotoAndUpload(folderId, itemName) {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.capture = "environment";

  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = await getNextPhotoName(folderId, itemName);

    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: file.type,
    };

    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    form.append("file", file);

    const upload = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      }
    );

    const uploaded = await upload.json();
    loadFolderImages(folderId);
    takePhotoAndUpload(folderId, itemName); // chain for multiple photos
  };

  fileInput.click();
}

async function loadFolderImages(folderId) {
  const grid = document.getElementById("preview-grid");
  const count = document.getElementById("photo-count");
  grid.innerHTML = "";

  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType contains 'image/'`,
    fields: "files(id, name)",
  });

  const files = res.result.files;
  count.textContent = `${files.length} photo${
    files.length !== 1 ? "s" : ""
  } in this folder`;

  files.forEach((file) => {
    const img = document.createElement("img");
    img.src = `https://drive.google.com/uc?export=view&id=${file.id}`;
    img.alt = file.name;
    grid.appendChild(img);
  });
}

init();

