# 📸 Instagram High-Res Downloader (Photos & Videos)

A lightweight, high-performance browser extension that adds an elegant download button directly onto Instagram photos, videos, and reels. It extracts media in original, uncompressed resolution (`1080p`+ for photos and full-length `.mp4` for videos) and saves them to your preferred folder.

Compatible with **Mozilla Firefox**, **Google Chrome**, **Microsoft Edge**, and **Brave**.

---

## ✨ Key Features

- **📸 Original High-Res Photos**: Automatically parses Instagram's `srcset` to download the maximum resolution available (1080px or higher) as `.jpg`.
- **🎬 Full-Length Videos & Reels**: Directly extracts the complete, unchunked high-definition `.mp4` video stream (no partial or 2KB chunk files).
- **🎯 Single Clean Overlay**: Only **one** unobtrusive circular download button appears on the top-right of photos and reels, positioned safely below Instagram's three-dots menu.
- **⚡ Fast Click Interception**: Immediate, reliable click response that never accidentally pauses or likes the video.
- **📁 Custom Folder Selector**:
  - **Default**: Saves directly to your standard **`Downloads`** folder.
  - **Custom Folder**: Click the 📁 icon to visually browse to any folder on your PC (e.g. `C:\Users\shiva\AppData\Local\Comfy-Desktop\ComfyUI-Shared\input`).
  - **Permanent Memory**: Remembers your chosen folder across browser restarts and computer reboots.
- **🎛️ Minimal Popup**: Compact toolbar menu with a quick **ON / OFF toggle** and folder selector with auto-save.

---

## 🚀 Installation Guide

### Method 1: Permanent Installation in Firefox (Recommended)

Firefox requires add-ons to be digitally signed by Mozilla to install permanently. You can get your own private copy signed in 60 seconds for free:

1. Open your browser and go to the **[Mozilla Developer Upload Page](https://addons.mozilla.org/developers/addon/submit/upload-unlisted)**.
2. Select **"On your own"** *(Unlisted / Self-distribution)*.
3. Upload the package file:
   ```
   c:\Users\shiva\Downloads\extenstions\ig-photo-downloader.xpi
   ```
4. When asked *"Do you need to submit source code?"*, select **"No"**.
5. Click **"Submit Version"**.
6. Wait about **1 minute** for the automated check to finish, then click the blue **`Download File`** link (or the link sent to your email).
7. When prompted by Firefox, click **`Add`**.

> **Result**: The extension is now permanently installed in your Firefox toolbar and will never disappear when you close Firefox!

---

### Method 2: Quick Temporary Load in Firefox (Testing)

If you just want to test without signing:

1. In Firefox, open:
   ```
   about:debugging#/runtime/this-firefox
   ```
2. In the **Temporary Extensions** section, click **"Load Temporary Add-on..."**.
3. Select [`manifest.json`](file:///c:/Users/shiva/Downloads/extenstions/manifest.json) from `c:\Users\shiva\Downloads\extenstions`.
4. The extension will activate immediately for your current browser session.

---

### Method 3: Installation in Chrome, Edge, or Brave

Chromium browsers allow permanent local installation directly:

1. Open your browser's extensions page:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click the **"Load unpacked"** button (top-left).
4. Select the folder:
   ```
   c:\Users\shiva\Downloads\extenstions
   ```
5. Click **Select Folder**. The extension is now installed permanently!

---

## 🎛️ How to Use

1. **Pin the Icon**:
   - In Firefox or Chrome, click the **puzzle-piece icon** in your toolbar.
   - Find **Instagram High-Res Downloader** and click the **Pin / Gear icon** to keep it visible on your toolbar.

2. **Download on Instagram**:
   - Open [Instagram](https://www.instagram.com).
   - Hover over or view any photo, video, or reel.
   - Click the circular download icon in the **top-right corner** of the media.
   - The media will download instantly!

3. **Change Download Folder (Optional)**:
   - Click the extension icon in your browser toolbar.
   - Click the **📁 folder icon** next to the input box.
   - A Windows folder picker will pop up — select your destination folder (e.g., your ComfyUI input folder) and click **Select Folder**.
   - It **auto-saves permanently**. All future downloads will go straight to that folder!
   - *To return to your default Downloads folder, simply erase the text in the box.*

4. **Toggle ON / OFF**:
   - Click the toolbar icon and flip the toggle switch to temporarily hide all download buttons on Instagram.

---

## 🔧 Native Folder Companion

Directly saving files outside the browser's `Downloads` folder (such as directly into `AppData` or other drives) is powered by a lightweight local helper script (`native_host.py`).

- **Status**: Already registered in your Windows registry (`HKCU:\Software\Mozilla\NativeMessagingHosts`).
- **If you ever move this extension folder**: Simply double-click **`register_native_host.bat`** once to update its path.

---

## 📁 File Structure

```
c:\Users\shiva\Downloads\extenstions\
├── manifest.json                # Extension configuration & permissions
├── background.js                # Service worker / event page (downloads & streams)
├── content.js                   # Media detector, srcset parser & button injector
├── styles.css                   # Frosted-glass UI styling & animations
├── popup.html                   # Minimal toolbar settings popup
├── popup.css                    # Popup styling
├── popup.js                     # Toggle logic & folder persistence
├── icons/                       # Extension icons (16, 48, 128 px)
├── native_host.py               # Native companion for custom folder picker & saving
├── native_host.bat              # Native host launcher
├── com.instagram.downloader.json# Native messaging manifest
├── register_native_host.bat     # 1-click registry helper
├── ig-photo-downloader.xpi      # Packaged extension ready for AMO signing
└── README.md                    # Documentation
```

---

## 💡 Troubleshooting

- **Download button not appearing?**
  - Refresh the Instagram tab (`Ctrl + F5`).
  - Open the extension popup from your toolbar and ensure the toggle switch is turned **ON**.
- **Folder picker not opening?**
  - Make sure Python is installed on your computer.
  - Double-click `register_native_host.bat` to ensure the companion is linked.
