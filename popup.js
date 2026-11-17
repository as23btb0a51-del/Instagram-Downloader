/**
 * Instagram High-Res Downloader - Minimal Popup Script
 * Default on first install is Downloads.
 * When the user changes the folder, it is permanently saved in browser.storage.local
 * and persists across all Firefox restarts.
 */

const extApi = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

document.addEventListener('DOMContentLoaded', () => {
  const toggleEl = document.getElementById('toggleExtension');
  const folderInputEl = document.getElementById('folderInput');
  const browseFolderBtn = document.getElementById('browseFolderBtn');
  const feedbackEl = document.getElementById('saveFeedback');

  // Load persistent settings (default: empty string = standard Downloads folder)
  extApi.storage.local.get(
    {
      enabled: true,
      downloadFolder: ''
    },
    (items) => {
      toggleEl.checked = items.enabled !== false;
      folderInputEl.value = items.downloadFolder || '';
    }
  );

  // Toggle Extension On / Off
  toggleEl.addEventListener('change', () => {
    const isEnabled = toggleEl.checked;
    extApi.storage.local.set({ enabled: isEnabled }, () => {
      notifyActiveTab({ action: 'TOGGLE_EXTENSION', enabled: isEnabled });
      showFeedback(isEnabled ? 'Enabled' : 'Disabled');
    });
  });

  // Browse Folder via Native Host
  browseFolderBtn.addEventListener('click', () => {
    showFeedback('Opening picker...');

    extApi.runtime.sendMessage({ action: 'BROWSE_FOLDER' }, (res) => {
      if (res && res.success && res.path) {
        folderInputEl.value = res.path;
        showFeedback('Folder saved permanently!');
      } else if (res && res.cancelled) {
        showFeedback('');
      } else if (res && res.error) {
        showFeedback(res.error, true);
      }
    });
  });

  function saveCurrentInput() {
    const path = folderInputEl.value.trim();
    extApi.storage.local.set({ downloadFolder: path }, () => {
      showFeedback(path ? 'Saved permanently' : 'Default: Downloads');
    });
  }

  // Auto-save on typing/pasting
  let inputTimer = null;
  folderInputEl.addEventListener('input', () => {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(saveCurrentInput, 300);
  });

  // Save immediately on change or blur
  folderInputEl.addEventListener('change', () => {
    clearTimeout(inputTimer);
    saveCurrentInput();
  });

  folderInputEl.addEventListener('blur', () => {
    clearTimeout(inputTimer);
    saveCurrentInput();
  });

  // Listen for storage changes
  if (extApi.storage && extApi.storage.onChanged) {
    extApi.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.downloadFolder) {
        folderInputEl.value = changes.downloadFolder.newValue || '';
      }
    });
  }

  function showFeedback(text, isError = false) {
    if (!text) {
      feedbackEl.textContent = '';
      return;
    }
    feedbackEl.textContent = text;
    feedbackEl.className = isError ? 'feedback-msg error' : 'feedback-msg';
    setTimeout(() => {
      feedbackEl.textContent = '';
    }, 2500);
  }

  function notifyActiveTab(message) {
    if (extApi.tabs && extApi.tabs.query) {
      extApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].id) {
          extApi.tabs.sendMessage(tabs[0].id, message).catch(() => {});
        }
      });
    }
  }
});
