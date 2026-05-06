<div align="center">
  <img src="public/logo.png" alt="Alt-Tag Studio Logo" width="120" />
  <h1>⚡ Alt-Tag Studio</h1>
</div>

**Alt-Tag Studio** is a powerful, privacy-first, AI-driven application designed to automate the tedious process of writing WCAG-compliant `alt` texts for HTML images. 

Rather than uploading your entire codebase to an online tool, Alt-Tag Studio works completely **locally in your browser**. It uses the modern File System Access API to parse your HTML, read your local image folders securely, and seamlessly inject AI-generated alt texts back into your original HTML files without requiring you to manually copy, paste, or download duplicated files.

---

![Alt-Tag Studio Demo](https://github.com/cyogesh56/Alt-Tag-Studio/blob/0a3d6eba5074e30b18f1a065f9a32b93b0b53d6c/Alt-Tag%20Studio%20Demo.webp)

## ✨ Features

- **Multi-AI Provider Support:** Connect your API keys to industry-leading vision models. Includes out-of-the-box support for:
  - 🧠 Google Gemini
  - 💬 OpenAI ChatGPT
  - 🎭 Anthropic Claude
- **Smart Auto-Switching:** Save multiple API keys. If your primary provider hits a rate limit or runs out of quota, the app instantly pauses and prompts you to switch to a backup provider seamlessly without losing progress.
- **Privacy-First Local Processing:** Your HTML files are parsed entirely in your browser using the File System Access API. Only the images that actually need alt texts are securely sent to the AI vision models as base64 strings.
- **In-Place Seamless Saves:** No more managing duplicate `file-copy(1).html` files. Hit **Overwrite HTML** to instantly and silently append the AI-generated alt tags directly into your original local HTML file.
- **Live Code Preview:** See exactly where your images exist in your HTML with real-time, auto-scrolling syntax highlighting.
- **Accessibility & UX:** Includes extensive keyboard shortcuts (e.g., `Cmd+G` to generate, `Cmd+S` to save & next), beautiful Dark/Light mode UI, and screen-reader polite announcements.

---

## 🛠️ How It Works

1. **Select your HTML:** Click to select an HTML file from your local machine. The app instantly parses the DOM to locate all `<img>` tags missing `alt` attributes.
2. **Pick Image Folder:** Point the app to your project's local image directory. It automatically cross-references and matches the `src` paths from the HTML to your local files.
3. **Generate:** The app displays the image and surrounding code context. Click Generate to let the AI vision model analyze the image and return a concise, WCAG-compliant alt-text.
4. **Save:** Click "Update & Next" to apply the text. When you're done, hit "Overwrite HTML" to permanently save the changes to your local file. 

---

## 🚀 Getting Started (Download for macOS)

[![Download from Releases](https://img.shields.io/badge/Download%20from%20Releases-blue?style=for-the-badge&logo=github)](https://github.com/cyogesh56/Alt-Tag-Studio/releases/tag/Prod)

## 🚀 Getting Started (Development)

Want to run Alt-Tag Studio locally, contribute, or build your own desktop version? Follow these steps:

### Prerequisites
- Node.js (v18+ recommended)
- Git

### 1. Clone the Repository
```bash
git clone https://github.com/cyogesh56/Alt-Tag-Studio.git
cd Alt-Tag-Studio
```

### 2. Install Dependencies
This project is built using React, Vite, TypeScript, and Tailwind CSS.
```bash
npm install
```

### 3. Run the Development Server
```bash
npm run dev
```
Open the `localhost` URL provided in your terminal to view the app in your browser.

---

## 📦 Building for Production

To build the optimized static web assets:
```bash
npm run build
```
This will generate a `dist` folder containing the compiled app, ready to be hosted on Vercel, Netlify, or any static file server.

### Desktop App Conversion (Electron / Tauri)
Alt-Tag Studio is designed to be highly portable and operates perfectly within Chromium wrappers since it relies on modern browser APIs (like the File System Access API). 
If you want to package this into a standalone macOS/Windows app, you can easily wrap the Vite build in **Electron** or **Tauri**. 
*(Note: Be sure to handle API key persistence using electron-store or Tauri plugins if transitioning away from the browser's local state).*

---

## 🤝 Contributing
Contributions, issues, and feature requests are always welcome! Feel free to fork this repository, make your tweaks, and submit a Pull Request.

## 📄 License
This project is open-source. Feel free to use, modify, and distribute it as needed.
