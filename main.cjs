const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Alt-Tag Studio',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Disables CORS for the desktop app so it can contact any API
    }
  });

  // Load the React app from the Vite build output
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  
  // Intercept target="_blank" links to open in the user's default external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      require('electron').shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  
  // Uncomment below to open DevTools
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
