// script.js
let tokenClient;
let accessToken = null;
let folderCache = {};

const SCOPES = "https://www.googleapis.com/auth/drive.file";

document.getElementById("login").onclick = () => {
  tokenClient.requestAccessToken();
};

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
        document.getElementById("auth").style.display = "none";
        document.getElementById("main").style.display = "block";
        showUserInfo();
      },
    });
  });

  document.getElementById("take-photo").onclick = async () => {
    const itemName = document.getElementById("item-name").value.trim();
    if (!itemName) return alert("Enter item name first.");

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.capture = "environment";

    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const folderId = await getOrCreateFolder(itemName);
      const nextFileName = await getNextPhotoName(folderId, itemName);

      const metadata = {
        name: nextFileName,
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
      console.log("Uploaded:", uploaded);
      loadFolderImages(folderId);
    };

    fileInput.click();
  };
}

function showUserInfo() {
  document.getElementById("user-info").innerText = "Logged in";
}

async function getOrCreateFolder(name) {
  if (folderCache[name]) return folderCache[name];

  const res = await gapi.client.drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`,
    fields: "files(id, name)",
  });

  if (res.result.files.length > 0) {
    folderCache[name] = res.result.files[0].id;
    loadFolderImages(folderCache[name]);
    return folderCache[name];
  }

  const createRes = await gapi.client.drive.files.create({
    resource: {
      name,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  folderCache[name] = createRes.result.id;
  return createRes.result.id;
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

async function loadFolderImages(folderId) {
  const grid = document.getElementById("preview-grid");
  grid.innerHTML = "";

  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType contains 'image/'`,
    fields: "files(id, name, thumbnailLink)",
  });

  res.result.files.forEach((file) => {
    const img = document.createElement("img");
    img.src = `https://drive.google.com/uc?id=${file.id}`;
    img.alt = file.name;
    grid.appendChild(img);
  });
}

init();
