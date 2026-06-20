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

  // Force a "Save As" dialog for any downloads (like saving a copy of the HTML)
  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
    item.setSaveDialogOptions({
      title: 'Save Copy As',
      filters: [
        { name: 'HTML Files', extensions: ['html', 'htm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
  });
  // Handle beforeunload properly in Electron
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = require('electron').dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Close App', 'Cancel'],
      title: 'Unsaved Changes',
      message: 'You have unsaved files. Are you sure you want to close the app? Your unsaved changes will be lost.',
      defaultId: 0,
      cancelId: 1
    });
    
    // If the user clicks "Close App" (index 0), we prevent the default behavior of "preventing unload",
    // thus allowing the app to close.
    if (choice === 0) {
      event.preventDefault();
    }
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
