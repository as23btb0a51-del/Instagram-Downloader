/**
 * Background Service Worker / Event Page for Instagram High-Res Downloader
 * Cross-browser support for Mozilla Firefox and Google Chrome.
 * Default download location is the user's standard Downloads folder.
 * Custom folders outside Downloads are handled seamlessly via Native Messaging.
 */

const extApi = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
const NATIVE_HOST = 'com.instagram.downloader';

// In-memory cache of captured video stream URLs
const capturedVideos = [];

function cleanMediaUrl(url) {
  if (!url) return '';
  let cleaned = url.replace(/&amp;/g, '&');
  // Strip byte range chunk limits so Instagram CDN sends the FULL video instead of a 2KB slice!
  cleaned = cleaned.replace(/([?&])bytestart=\d+&?/g, '$1')
                   .replace(/([?&])byteend=\d+&?/g, '$1')
                   .replace(/([?&])range=\d+-\d+&?/g, '$1')
                   .replace(/[?&]$/, '');
  return cleaned.replace('?&', '?');
}

// Listen for network video stream requests
if (extApi.webRequest && extApi.webRequest.onBeforeRequest) {
  try {
    extApi.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (details.url && (details.url.includes('.mp4') || details.url.includes('/video/'))) {
          const fullUrl = cleanMediaUrl(details.url);
          capturedVideos.unshift({
            url: fullUrl,
            time: Date.now()
          });
          if (capturedVideos.length > 25) {
            capturedVideos.pop();
          }
        }
      },
      { urls: ['*://*.cdninstagram.com/*', '*://*.fbcdn.net/*'] }
    );
  } catch (err) {
    console.warn('[IG Downloader] WebRequest listener registration warning:', err);
  }
}

// Listen for messages from popup and content scripts
extApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'DOWNLOAD_MEDIA') {
    handleDownload(request, sendResponse);
    return true; // Keep message channel open for async response
  }

  if (request.action === 'GET_LATEST_VIDEO') {
    const latest = capturedVideos.length > 0 ? capturedVideos[0].url : null;
    sendResponse({ success: !!latest, url: latest });
    return true;
  }

  if (request.action === 'BROWSE_FOLDER') {
    handleBrowseFolder(sendResponse);
    return true;
  }
});

/**
 * Opens native Windows folder browser and automatically saves selected folder to storage
 */
function handleBrowseFolder(sendResponse) {
  extApi.storage.local.get({ downloadFolder: '' }, (items) => {
    const currentFolder = items.downloadFolder || '';

    if (extApi.runtime && extApi.runtime.sendNativeMessage) {
      extApi.runtime.sendNativeMessage(
        NATIVE_HOST,
        { action: 'choose_directory', current_dir: currentFolder },
        (res) => {
          if (extApi.runtime.lastError) {
            console.warn('[IG Downloader] Native host error:', extApi.runtime.lastError.message);
            sendResponse({ success: false, error: extApi.runtime.lastError.message });
            return;
          }

          if (res && res.success && res.path) {
            extApi.storage.local.set({ downloadFolder: res.path }, () => {
              console.log('[IG Downloader] Custom folder saved:', res.path);
              sendResponse({ success: true, path: res.path });
            });
          } else {
            sendResponse({ success: false, cancelled: true });
          }
        }
      );
    } else {
      sendResponse({ success: false, error: 'Native messaging unavailable' });
    }
  });
}

function isAbsolutePath(path) {
  if (!path) return false;
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\') || path.startsWith('/');
}

/**
 * Executes media download
 */
async function handleDownload(request, sendResponse) {
  const { url: rawUrl, filename } = request;

  if (!rawUrl) {
    sendResponse({ success: false, error: 'No URL provided' });
    return;
  }

  const url = cleanMediaUrl(rawUrl);
  const safeFilename = filename || `instagram_media_${Date.now()}.mp4`;

  extApi.storage.local.get({ downloadFolder: '' }, (items) => {
    const targetFolder = (items.downloadFolder || '').trim();

    // 1. If user configured a custom absolute path, use Native Host
    if (targetFolder && isAbsolutePath(targetFolder) && extApi.runtime.sendNativeMessage) {
      extApi.runtime.sendNativeMessage(
        NATIVE_HOST,
        {
          action: 'save_file',
          url: url,
          target_dir: targetFolder,
          filename: safeFilename
        },
        (nativeRes) => {
          if (!extApi.runtime.lastError && nativeRes && nativeRes.success) {
            console.log('[IG Downloader] Media saved to custom folder:', nativeRes.saved_path);
            sendResponse({ success: true, path: nativeRes.saved_path, size: nativeRes.size });
            return;
          }

          console.warn('[IG Downloader] Native host unavailable, falling back to default Downloads folder:', extApi.runtime.lastError?.message || nativeRes?.error);
          fallbackBrowserDownload(url, safeFilename, sendResponse);
        }
      );
      return;
    }

    // 2. Default: Save directly into browser Downloads folder
    fallbackBrowserDownload(url, safeFilename, sendResponse);
  });
}

/**
 * Standard browser downloads API (saves to Downloads folder)
 */
async function fallbackBrowserDownload(url, filename, sendResponse) {
  try {
    if (typeof browser !== 'undefined' && browser.downloads && browser.downloads.download) {
      try {
        const downloadId = await browser.downloads.download({
          url: url,
          filename: filename,
          conflictAction: 'uniquify',
          saveAs: false
        });
        sendResponse({ success: true, downloadId, path: filename });
        return;
      } catch (firefoxErr) {
        console.warn('[IG Downloader] Direct download failed, attempting blob fallback:', firefoxErr);
        await downloadViaBlob(url, filename, sendResponse);
        return;
      }
    }

    chrome.downloads.download(
      {
        url: url,
        filename: filename,
        conflictAction: 'uniquify',
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.warn('[IG Downloader] Direct download failed, attempting blob fallback:', chrome.runtime.lastError.message);
          downloadViaBlob(url, filename, sendResponse);
        } else {
          sendResponse({ success: true, downloadId, path: filename });
        }
      }
    );
  } catch (error) {
    console.warn('[IG Downloader] Direct download exception, attempting blob fallback:', error);
    downloadViaBlob(url, filename, sendResponse);
  }
}

/**
 * Blob fallback for browser download
 */
async function downloadViaBlob(url, destinationPath, sendResponse) {
  try {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) {
      throw new Error(`Fetch failed with HTTP status ${response.status}`);
    }

    const blob = await response.blob();
    const reader = new FileReader();

    reader.onloadend = async () => {
      const dataUrl = reader.result;

      if (typeof browser !== 'undefined' && browser.downloads && browser.downloads.download) {
        try {
          const downloadId = await browser.downloads.download({
            url: dataUrl,
            filename: destinationPath,
            conflictAction: 'uniquify',
            saveAs: false
          });
          sendResponse({ success: true, downloadId, path: destinationPath });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      } else {
        chrome.downloads.download(
          {
            url: dataUrl,
            filename: destinationPath,
            conflictAction: 'uniquify',
            saveAs: false
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse({ success: true, downloadId, path: destinationPath });
            }
          }
        );
      }
    };

    reader.onerror = () => {
      sendResponse({ success: false, error: 'Failed to read image data' });
    };

    reader.readAsDataURL(blob);
  } catch (err) {
    console.error('[IG Downloader] Fallback download failed:', err);
    sendResponse({ success: false, error: err.message });
  }
}
