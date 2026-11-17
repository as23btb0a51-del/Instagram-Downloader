/**
 * Instagram High-Res Downloader - Content Script
 * Automatically detects Instagram photos & videos and embeds a single top-right download button.
 * Intercepts events in the capture phase to ensure 100% clickability over video overlays.
 * Strips byte-range chunk limits to guarantee full-length MP4 downloads (not 2KB chunks).
 */

(function () {
  'use strict';

  const extApi = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

  let isExtensionEnabled = true;

  // Safe DOM SVG Builder
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function createSvgElement(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value);
    }
    return el;
  }

  function buildSvg(type) {
    const svg = createSvgElement('svg', { viewBox: '0 0 24 24' });

    if (type === 'download') {
      const path = createSvgElement('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' });
      const polyline = createSvgElement('polyline', { points: '7 10 12 15 17 10' });
      const line = createSvgElement('line', { x1: '12', y1: '15', x2: '12', y2: '3' });
      svg.append(path, polyline, line);
    } else if (type === 'loading') {
      const path = createSvgElement('path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' });
      svg.append(path);
    } else if (type === 'success') {
      const polyline = createSvgElement('polyline', { points: '20 6 9 17 4 12' });
      svg.append(polyline);
    } else if (type === 'error') {
      const line1 = createSvgElement('line', { x1: '18', y1: '6', x2: '6', y2: '18' });
      const line2 = createSvgElement('line', { x1: '6', y1: '6', x2: '18', y2: '18' });
      svg.append(line1, line2);
    }

    return svg;
  }

  function replaceButtonIcon(btn, type) {
    const newSvg = buildSvg(type);
    const oldSvg = btn.querySelector('svg');
    if (oldSvg) {
      oldSvg.replaceWith(newSvg);
    } else {
      btn.appendChild(newSvg);
    }
  }

  /**
   * Handle real-time toggle state
   */
  function setExtensionEnabled(enabled) {
    isExtensionEnabled = enabled !== false;
    if (!isExtensionEnabled) {
      const buttons = document.querySelectorAll('.ig-dl-btn-container');
      buttons.forEach((btn) => btn.remove());

      const marked = document.querySelectorAll('[data-ig-dl-attached]');
      marked.forEach((el) => el.removeAttribute('data-ig-dl-attached'));
    } else {
      triggerScan();
    }
  }

  // Load initial toggle state from storage
  if (extApi.storage && extApi.storage.local) {
    extApi.storage.local.get({ enabled: true }, (items) => {
      setExtensionEnabled(items.enabled);
    });

    extApi.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.enabled !== undefined) {
        setExtensionEnabled(changes.enabled.newValue);
      }
    });
  }

  // Listen for direct messages from popup
  extApi.runtime.onMessage.addListener((request) => {
    if (request && request.action === 'TOGGLE_EXTENSION') {
      setExtensionEnabled(request.enabled);
    }
  });

  function cleanUrl(url) {
    if (!url) return '';
    let cleaned = url.replace(/&amp;/g, '&');
    // Strip byte range limits so the server serves the ENTIRE video file!
    cleaned = cleaned.replace(/([?&])bytestart=\d+&?/g, '$1')
                     .replace(/([?&])byteend=\d+&?/g, '$1')
                     .replace(/([?&])range=\d+-\d+&?/g, '$1')
                     .replace(/[?&]$/, '');
    return cleaned.replace('?&', '?');
  }

  /**
   * Parse photo srcset and return highest quality URL available
   */
  function extractBestQualityPhotoUrl(img) {
    if (!img) return null;

    const srcset = img.getAttribute('srcset') || img.srcset;
    if (srcset && typeof srcset === 'string') {
      const candidates = [];
      const regex = /(https?:\/\/[^\s,]+)(?:\s+(\d+)w)?/g;
      let match;
      while ((match = regex.exec(srcset)) !== null) {
        const url = match[1];
        const width = match[2] ? parseInt(match[2], 10) : 0;
        candidates.push({ url, width });
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.width - a.width);
        if (candidates[0] && candidates[0].url) {
          return cleanUrl(candidates[0].url);
        }
      }
    }

    const fallback = img.currentSrc || img.src;
    return fallback ? cleanUrl(fallback) : null;
  }

  /**
   * Walk React Fiber to find the direct, full-length video URL
   */
  function findVideoFromReact(el) {
    try {
      let curr = el;
      while (curr && curr !== document.body) {
        const key = Object.keys(curr).find(
          (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$') || k.startsWith('__reactInternalInstance$')
        );
        if (key) {
          let fiber = curr[key];
          let depth = 0;
          while (fiber && depth < 30) {
            const props = fiber.memoizedProps || fiber.pendingProps || fiber.props;
            if (props) {
              if (props.video_url && typeof props.video_url === 'string') {
                return cleanUrl(props.video_url);
              }
              if (Array.isArray(props.video_versions) && props.video_versions.length > 0) {
                const sorted = [...props.video_versions].sort((a, b) => (b.width || 0) - (a.width || 0));
                if (sorted[0] && sorted[0].url) {
                  return cleanUrl(sorted[0].url);
                }
              }
              const media = props.item || props.post || props.media || props.reel;
              if (media) {
                if (media.video_url) return cleanUrl(media.video_url);
                if (Array.isArray(media.video_versions) && media.video_versions.length > 0) {
                  return cleanUrl(media.video_versions[0].url);
                }
              }
            }
            fiber = fiber.return;
            depth++;
          }
        }
        curr = curr.parentElement;
      }
    } catch (e) {
      console.warn('[IG Downloader] React traversal notice:', e);
    }
    return null;
  }

  /**
   * Extract video URL from <video> element
   */
  function extractVideoUrl(video, callback) {
    if (!video) {
      callback(null);
      return;
    }

    // 1. Try React Fiber state (holds clean, unchunked full-resolution MP4)
    const reactUrl = findVideoFromReact(video);
    if (reactUrl && !reactUrl.startsWith('blob:') && reactUrl.startsWith('http')) {
      callback(reactUrl);
      return;
    }

    // 2. Direct src attribute
    const src = video.currentSrc || video.src || video.getAttribute('src');
    if (src && !src.startsWith('blob:') && src.startsWith('http')) {
      callback(cleanUrl(src));
      return;
    }

    // 3. Child <source> tags
    const sources = video.querySelectorAll('source');
    for (const s of sources) {
      const sSrc = s.src || s.getAttribute('src');
      if (sSrc && !sSrc.startsWith('blob:') && sSrc.startsWith('http')) {
        callback(cleanUrl(sSrc));
        return;
      }
    }

    // 4. Background network-captured stream URL
    extApi.runtime.sendMessage({ action: 'GET_LATEST_VIDEO' }, (res) => {
      if (res && res.success && res.url) {
        callback(cleanUrl(res.url));
      } else {
        callback(null);
      }
    });
  }

  /**
   * Generates a descriptive filename
   */
  function generateFilename(el, isVideo = false) {
    let username = '';
    try {
      const container = el.closest('article') || el.closest('div[role="dialog"]');
      if (container) {
        const userLink = container.querySelector('header a[role="link"], header a[href^="/"]');
        if (userLink) {
          const raw = userLink.textContent.trim() || userLink.getAttribute('href') || '';
          username = raw.replace(/^\//, '').split('/')[0].replace(/[^a-zA-Z0-9._-]/g, '');
        }
      }

      if (!username) {
        const match = window.location.pathname.match(/\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)/);
        if (match) {
          username = `${match[1]}`;
        }
      }
    } catch (e) {
      // ignore
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const ext = isVideo ? 'mp4' : 'jpg';
    const prefix = username ? `instagram_${username}` : (isVideo ? 'instagram_video' : 'instagram_photo');
    return `${prefix}_${dateStr}_${rand}.${ext}`;
  }

  /**
   * Finds the outermost media container (above any video overlay shields)
   */
  function findMediaContainer(el) {
    const carouselSlide = el.closest('li');
    if (carouselSlide) {
      ensureRelativePosition(carouselSlide);
      return carouselSlide;
    }

    let current = el.parentElement;
    let bestContainer = current;

    while (current && current !== document.body && current.tagName !== 'ARTICLE' && current.getAttribute('role') !== 'dialog') {
      const rect = current.getBoundingClientRect();
      if (rect.width >= 160 && rect.height >= 160) {
        bestContainer = current;
      }
      current = current.parentElement;
    }

    if (bestContainer) {
      ensureRelativePosition(bestContainer);
      return bestContainer;
    }

    ensureRelativePosition(el.parentElement);
    return el.parentElement;
  }

  function ensureRelativePosition(el) {
    if (!el) return;
    const pos = window.getComputedStyle(el).position;
    if (pos === 'static') {
      el.style.position = 'relative';
    }
  }

  /**
   * Check if element is an avatar, small icon, or tiny thumbnail
   */
  function isIgnoredMedia(el) {
    if (!el) return true;

    if (el.closest('header')) return true;

    if (el.tagName === 'IMG') {
      const alt = (el.alt || '').toLowerCase();
      if (alt.includes('profile picture') || alt.includes('profile photo')) return true;
    }

    const width = el.offsetWidth || el.videoWidth || el.naturalWidth || 0;
    const height = el.offsetHeight || el.videoHeight || el.naturalHeight || 0;

    if (width > 0 && width < 140 && height > 0 && height < 140) {
      return true;
    }

    return false;
  }

  function showButtonState(btn, tooltip, state, text) {
    btn.classList.remove('is-loading', 'is-success', 'is-error');
    if (state === 'loading') {
      btn.classList.add('is-loading');
      replaceButtonIcon(btn, 'loading');
    } else if (state === 'success') {
      btn.classList.add('is-success');
      replaceButtonIcon(btn, 'success');
    } else if (state === 'error') {
      btn.classList.add('is-error');
      replaceButtonIcon(btn, 'error');
    }
    if (tooltip && text) {
      tooltip.textContent = text;
    }
  }

  function resetButtonState(btn, tooltip, defaultLabel) {
    btn.classList.remove('is-loading', 'is-success', 'is-error');
    replaceButtonIcon(btn, 'download');
    if (tooltip) {
      tooltip.textContent = defaultLabel || 'Download';
    }
  }

  /**
   * Construct and attach a single download button
   */
  function attachDownloadButton(mediaEl) {
    if (!isExtensionEnabled) return;

    if (mediaEl.hasAttribute('data-ig-dl-attached')) return;

    if (isIgnoredMedia(mediaEl)) return;

    const isVideo = mediaEl.tagName === 'VIDEO';

    // Find the enclosing post/slide unit to prevent duplicate buttons
    const postUnit = mediaEl.closest('li') || mediaEl.closest('article') || mediaEl.closest('div[role="dialog"]') || mediaEl.parentElement;

    // If this is an IMG, check if a video exists in the same post (i.e. poster thumbnail)
    if (!isVideo && postUnit && postUnit.querySelector('video')) {
      mediaEl.setAttribute('data-ig-dl-attached', 'true');
      return;
    }

    // Check if a button already exists in this post unit
    const existingBtn = postUnit ? postUnit.querySelector('.ig-dl-btn-container') : null;
    if (existingBtn) {
      if (isVideo) {
        // Upgrade: remove older photo/poster button and prioritize video button
        existingBtn.remove();
      } else {
        mediaEl.setAttribute('data-ig-dl-attached', 'true');
        return;
      }
    }

    const container = findMediaContainer(mediaEl);
    if (!container) return;

    const defaultLabel = isVideo ? 'Download Video' : 'Download Photo';

    const wrapper = document.createElement('div');
    wrapper.className = 'ig-dl-btn-container';

    // Position down on videos & reels to clear the header and 3-dots menu
    if (isVideo) {
      wrapper.classList.add('is-video');
      wrapper.classList.add('offset-down');
    }

    const containerText = container.textContent || '';
    if (/\b\d+\s*\/\s*\d+\b/.test(containerText)) {
      wrapper.classList.add('offset-right');
    }

    const btn = document.createElement('button');
    btn.className = 'ig-dl-btn';
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', defaultLabel);
    btn.appendChild(buildSvg('download'));

    const tooltip = document.createElement('span');
    tooltip.className = 'ig-dl-tooltip';
    tooltip.textContent = defaultLabel;

    wrapper.appendChild(btn);
    wrapper.appendChild(tooltip);

    // Primary Click Action (Captured early to block Instagram overlay interference)
    function handleAction(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      showButtonState(btn, tooltip, 'loading', 'Fetching media...');

      const processDownload = (mediaUrl) => {
        if (!mediaUrl) {
          showButtonState(btn, tooltip, 'error', 'URL not found');
          setTimeout(() => resetButtonState(btn, tooltip, defaultLabel), 2000);
          return;
        }

        showButtonState(btn, tooltip, 'loading', 'Downloading...');
        const filename = generateFilename(mediaEl, isVideo);

        extApi.runtime.sendMessage(
          {
            action: 'DOWNLOAD_MEDIA',
            url: mediaUrl,
            filename: filename
          },
          (response) => {
            if (response && response.success) {
              showButtonState(btn, tooltip, 'success', 'Downloaded!');
            } else {
              console.error('[IG Downloader] Download failed:', response ? response.error : 'Unknown');
              showButtonState(btn, tooltip, 'error', 'Failed');
            }
            setTimeout(() => resetButtonState(btn, tooltip, defaultLabel), 1800);
          }
        );
      };

      if (isVideo) {
        extractVideoUrl(mediaEl, processDownload);
      } else {
        const photoUrl = extractBestQualityPhotoUrl(mediaEl);
        processDownload(photoUrl);
      }
    }

    // Attach with capture: true so our button intercepts events before Instagram overlays
    btn.addEventListener('click', handleAction, { capture: true });
    btn.addEventListener('mousedown', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); }, { capture: true });
    btn.addEventListener('mouseup', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); }, { capture: true });
    btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); }, { capture: true });
    btn.addEventListener('pointerup', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); }, { capture: true });
    btn.addEventListener('dblclick', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); }, { capture: true });

    // Append as the last child of the top media container to sit on top of all overlay shields
    container.appendChild(wrapper);
    mediaEl.setAttribute('data-ig-dl-attached', 'true');
  }

  /**
   * Scans document for photos and videos
   */
  function scanForMedia() {
    if (!isExtensionEnabled) return;

    // Scan videos first so video posts get prioritized over poster images
    const videos = document.querySelectorAll(
      'article video, div[role="dialog"] video, main video, li video, [role="presentation"] video, video'
    );
    videos.forEach((v) => {
      if (v.hasAttribute('data-ig-dl-attached')) return;
      attachDownloadButton(v);
    });

    // Scan images second
    const images = document.querySelectorAll(
      'article img, div[role="dialog"] img, main img, li img, [role="presentation"] img'
    );
    images.forEach((img) => {
      if (img.hasAttribute('data-ig-dl-attached')) return;

      if (img.complete && (img.naturalWidth > 0 || img.offsetWidth > 0)) {
        attachDownloadButton(img);
      } else {
        img.addEventListener('load', () => attachDownloadButton(img), { once: true });
      }
    });
  }

  let scanTimeout = null;
  function triggerScan() {
    if (!isExtensionEnabled) return;
    if (scanTimeout) cancelAnimationFrame(scanTimeout);
    scanTimeout = requestAnimationFrame(() => {
      scanForMedia();
    });
  }

  const observer = new MutationObserver(() => {
    if (isExtensionEnabled) {
      triggerScan();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', triggerScan);
  } else {
    triggerScan();
  }

  setInterval(triggerScan, 2000);

  console.log('[IG Downloader] Media detection active.');
})();
