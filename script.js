// Global variables and scope
let tokenClient;
let accessToken = null;
let rootFolderId = null;      // Amazon Product Photos folder
let currentFolderId = null;   // Current SKU folder
let currentSKU = "";

const SCOPES = "https://www.googleapis.com/auth/drive.file";

// Initialize the app
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

    // Attempt silent login if token exists
    const savedToken = sessionStorage.getItem("access_token");
    if (savedToken) {
      accessToken = savedToken;
      onLoginSuccess();
    }
  });

  // Login button
  document.getElementById("login").onclick = () => {
    tokenClient.requestAccessToken({ prompt: "consent" });
  };

  // Search button on Home Screen
  document.getElementById("search-btn").onclick = async () => {
    const sku = document.getElementById("sku-input").value.trim();
    if (!sku) {
      alert("Please enter a product SKU.");
      return;
    }
    currentSKU = sku;
    // Check if folder exists; if not, prompt to create it
    currentFolderId = await getOrCreateSKUFolder(sku);
    // Switch to Folder View
    showFolderView(sku, currentFolderId);
  };

  // Back button in Folder View
  document.getElementById("back-btn").onclick = () => {
    document.getElementById("folderView").style.display = "none";
    document.getElementById("home").style.display = "block";
    // Optionally, refresh folder list
    loadFolderList();
  };
}

// Called after successful login
function onLoginSuccess() {
  document.getElementById("auth").style.display = "none";
  document.getElementById("home").style.display = "block";
  getOrCreateRootFolder();
  loadFolderList();
}

// Create or retrieve the root folder "Amazon Product Photos"
async function getOrCreateRootFolder() {
  const res = await gapi.client.drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder' and name='Amazon Product Photos' and trashed=false",
    fields: "files(id, name)",
  });

  if (res.result.files && res.result.files.length > 0) {
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
}

// Load list of SKU folders (child folders of root) on Home Screen
async function loadFolderList() {
  const folderListDiv = document.getElementById("folder-list");
  folderListDiv.innerHTML = "";
  if (!rootFolderId) {
    await getOrCreateRootFolder();
  }
  const res = await gapi.client.drive.files.list({
    q: `'${rootFolderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
    fields: "files(id, name)",
  });
  const folders = res.result.files || [];
  folders.forEach(async (folder) => {
    // Get photo count for each folder
    const count = await getPhotoCount(folder.id);
    const div = document.createElement("div");
    div.className = "folder-item";
    div.textContent = `${folder.name} (${count} photo${count !== 1 ? "s" : ""})`;
    // Click to open folder view
    div.onclick = () => {
      currentSKU = folder.name;
      currentFolderId = folder.id;
      showFolderView(folder.name, folder.id);
    };
    folderListDiv.appendChild(div);
  });
}

// Get photo count in a folder
async function getPhotoCount(folderId) {
  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType contains 'image/'`,
    fields: "files(id)",
  });
  return res.result.files ? res.result.files.length : 0;
}

// Create or get the folder for a given SKU inside the root folder
async function getOrCreateSKUFolder(sku) {
  const res = await gapi.client.drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${sku}' and '${rootFolderId}' in parents and trashed=false`,
    fields: "files(id, name)",
  });
  if (res.result.files && res.result.files.length > 0) {
    return res.result.files[0].id;
  } else {
    if (confirm(`Folder for SKU "${sku}" does not exist. Create it?`)) {
      const createRes = await gapi.client.drive.files.create({
        resource: {
          name: sku,
          mimeType: "application/vnd.google-apps.folder",
          parents: [rootFolderId],
        },
        fields: "id",
      });
      return createRes.result.id;
    } else {
      return null;
    }
  }
}

// Switch to Folder View: display folder name, load images
async function showFolderView(sku, folderId) {
  if (!folderId) return;
  document.getElementById("home").style.display = "none";
  document.getElementById("folderView").style.display = "block";
  document.getElementById("folder-name-label").textContent = sku;
  loadFolderImages(folderId);
}

// Load images from the given folder and display thumbnails in Folder View
async function loadFolderImages(folderId) {
  const grid = document.getElementById("preview-grid");
  const countElem = document.getElementById("photo-count");
  grid.innerHTML = "";
  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType contains 'image/'`,
    fields: "files(id, name)",
  });
  const files = res.result.files || [];
  countElem.textContent = `${files.length} photo${files.length !== 1 ? "s" : ""} in this folder`;
  
  // Add the "Add Photos" tile as the first grid element
  const addTile = document.createElement("div");
  addTile.className = "add-photos";
  addTile.innerHTML = "+";
  addTile.onclick = () => {
    // For Phase 1, we’ll simply trigger a file input to simulate upload.
    uploadPhotos(folderId, currentSKU);
  };
  grid.appendChild(addTile);
  
  // Loop through files and create thumbnail images
  files.forEach((file) => {
    const img = document.createElement("img");
    // Use Drive's export URL for viewing images
    img.src = `https://drive.google.com/uc?export=view&id=${file.id}`;
    img.alt = file.name;
    // (Delete functionality will be added in Phase 2)
    grid.appendChild(img);
  });
}

// Dummy function to simulate photo upload (Phase 2 will improve this)
function uploadPhotos(folderId, sku) {
  // Create a file input to let the user select one or multiple images
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.multiple = true;
  
  fileInput.onchange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    for (const file of files) {
      const fileName = await getNextPhotoName(folderId, sku);
      const metadata = {
        name: fileName,
        parents: [folderId],
        mimeType: file.type,
      };
      
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      form.append("file", file);
      
      await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      });
    }
    // After uploads, refresh the folder view
    loadFolderImages(folderId);
    // Also refresh the home screen folder list (to update photo counts)
    loadFolderList();
  };
  fileInput.click();
}

// Generate the next file name based on existing files in the folder
async function getNextPhotoName(folderId, baseName) {
  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(name)",
  });
  const names = (res.result.files || []).map(f => f.name);
  const numbers = names
    .map(name => {
      const num = name.replace(baseName, "").replace(/\D/g, "");
      return parseInt(num, 10);
    })
    .filter(n => !isNaN(n));
  
  const nextNum = (Math.max(0, ...numbers) + 1).toString().padStart(4, "0");
  return `${baseName}${nextNum}.jpg`;
}

init();


