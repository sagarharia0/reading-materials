/* ==========================================================================
   reading-materials — Terminal UI App
   ========================================================================== */

(function () {
  'use strict';

  // ---- State ----
  let db = null;
  let currentView = 'digest';
  let currentItemId = null;

  // API base — works for both emulator and production.
  // In emulator mode, Firebase Hosting runs on :5000 and
  // proxies /api/* to the Functions emulator via the
  // hosting rewrite in firebase.json.
  var apiBase = '';

  // ---- DOM refs ----
  const views = document.querySelectorAll('.view');
  const navLinks = document.querySelectorAll('.shell-nav a[data-view]');
  const digestDate = document.getElementById('digest-date');
  const digestContent = document.getElementById('digest-content');
  const libraryContent = document.getElementById('library-content');
  const searchInput = document.getElementById('search-input');
  const filterSource = document.getElementById('filter-source');
  const filterStatus = document.getElementById('filter-status');
  const urlForm = document.getElementById('url-form');
  const urlInput = document.getElementById('url-input');
  const submitStatus = document.getElementById('submit-status');
  const toast = document.getElementById('toast');

  // ---- Helpers ----

  function formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  function timeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'min ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
  }

  function renderStars(score) {
    if (!score) return '';
    const filled = Math.round(score);
    return '<span class="stars">' +
      '*'.repeat(filled) +
      '</span><span class="stars-dim">' +
      '*'.repeat(5 - filled) +
      '</span>';
  }

  function showToast(message, type) {
    toast.textContent = message;
    toast.className = 'toast visible' + (type ? ' toast--' + type : '');
    setTimeout(function () {
      toast.className = 'toast';
    }, 3000);
  }

  function renderSourceBadge(sourceType) {
    return '<span class="source-badge source-badge--' + sourceType + '">' +
      sourceType + '</span>';
  }

  function renderStatusBadge(status) {
    return '<span class="status status--' + status + '">' + status + '</span>';
  }

  function renderTags(tags) {
    if (!tags || !tags.length) return '';
    return tags.map(function (t) {
      return '<span class="tag">' + escapeHtml(t) + '</span>';
    }).join('');
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function extractYouTubeId(url) {
    var m = url.match(/youtube\.com\/watch\?v=([^&]+)/) ||
            url.match(/youtu\.be\/([^?]+)/) ||
            url.match(/youtube\.com\/embed\/([^?]+)/) ||
            url.match(/youtube\.com\/shorts\/([^?]+)/);
    return m ? m[1] : null;
  }

  function renderConfidenceBanner(d) {
    var meta = d.extractionMeta;
    if (!meta) return '';

    var color, icon;
    if (meta.confidence === 'high') {
      color = 'var(--green)';
      icon = '*';
    } else if (meta.confidence === 'partial') {
      color = 'var(--yellow)';
      icon = '!';
    } else {
      color = 'var(--red)';
      icon = 'x';
    }

    var html = '<div style="margin-top: var(--space-sm); padding: var(--space-sm) var(--space-md); ' +
      'border-left: 2px solid ' + color + '; background: var(--surface-alt); ' +
      'font-size: 0.8rem; border-radius: 0 var(--radius) var(--radius) 0;">' +
      '<span style="color: ' + color + ';">[' + icon + '] extraction: ' + meta.confidence + '</span>' +
      ' <span style="color: var(--text-dim);">' + escapeHtml(meta.confidenceReason) + '</span>';

    if (meta.confidence === 'none' && d.sourceType === 'youtube') {
      html += '<div style="margin-top: var(--space-xs); color: var(--text-muted);">' +
        'watch the video below and use the notes field to capture key points</div>';
    }

    html += '</div>';
    return html;
  }

  // ---- View Switching ----

  function switchView(name) {
    currentView = name;
    views.forEach(function (v) {
      v.hidden = v.id !== 'view-' + name;
    });
    navLinks.forEach(function (a) {
      a.classList.toggle('active', a.dataset.view === name);
    });

    if (name === 'digest') loadDigest();
    if (name === 'library') loadLibrary();
    if (name === 'highlights') loadHighlights();
  }

  navLinks.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      switchView(a.dataset.view);
      window.location.hash = a.dataset.view;
    });
  });

  // Deep-dive back link
  var backLinks = document.querySelectorAll('[data-view]');
  backLinks.forEach(function (link) {
    if (link.closest('.shell-nav')) return;
    link.addEventListener('click', function (e) {
      e.preventDefault();
      switchView(link.dataset.view);
    });
  });

  // ---- Render: Card ----

  function renderCard(doc, index) {
    var d = doc.data ? doc.data() : doc;
    var id = doc.id || d.id;
    var html = '<div class="card" data-id="' + id + '">' +
      '<div class="card-index">' + (index + 1) + '</div>' +
      '<div class="card-title" data-action="open" data-id="' + id + '">' +
        escapeHtml(d.title || 'Untitled') +
        ' <span class="card-arrow">&#8599;</span>' +
      '</div>' +
      '<div class="card-meta">' +
        renderSourceBadge(d.sourceType || 'article') +
        renderStatusBadge(d.status || 'queued') +
        (d.dateAdded ? '<span>' + timeAgo(d.dateAdded.toDate ? d.dateAdded.toDate() : new Date(d.dateAdded)) + '</span>' : '') +
        '<span>' + renderStars(d.deeperScore) + '</span>' +
      '</div>' +
      '<div class="card-summary">' + escapeHtml(d.summary || '') + '</div>' +
      (d.tags ? '<div style="margin-top: var(--space-sm);">' + renderTags(d.tags) + '</div>' : '') +
    '</div>';
    return html;
  }

  // ---- Render: Digest ----

  var digestNav = document.getElementById('digest-nav');
  var digestPrev = document.getElementById('digest-prev');
  var digestNext = document.getElementById('digest-next');
  var digestListBtn = document.getElementById('digest-list-btn');
  var digestListEl = document.getElementById('digest-list');
  var allDigests = []; // cached list of {id, date}
  var currentDigestIndex = 0;

  function loadDigest() {
    digestDate.textContent = formatDate(new Date());
    digestListEl.hidden = true;

    if (!db) {
      digestContent.innerHTML = '<div class="empty-state"><p>connecting to firebase...</p></div>';
      return;
    }

    // Load all digests to enable navigation.
    db.collection('digests')
      .orderBy('date', 'desc')
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          digestNav.hidden = true;
          loadTodayItems();
          return;
        }

        allDigests = [];
        snapshot.forEach(function (doc) {
          allDigests.push({ id: doc.id, data: doc.data() });
        });

        digestNav.hidden = allDigests.length <= 1;
        currentDigestIndex = 0;
        renderDigestAtIndex(0);
      })
      .catch(function (err) {
        console.error('Digest load error:', err);
        loadTodayItems();
      });
  }

  function renderDigestAtIndex(index) {
    if (index < 0 || index >= allDigests.length) return;
    currentDigestIndex = index;

    var entry = allDigests[index];
    var digest = entry.data;
    var dateStr = digest.date && digest.date.toDate ?
      formatDate(digest.date.toDate()) : '';
    digestDate.textContent = dateStr;
    digestContent.innerHTML = digest.htmlContent ||
      '<div class="empty-state"><p>digest is empty</p></div>';
    attachCardListeners(digestContent);

    // Update nav button states.
    digestPrev.disabled = (index >= allDigests.length - 1);
    digestNext.disabled = (index <= 0);
    digestPrev.style.opacity = digestPrev.disabled ? '0.3' : '1';
    digestNext.style.opacity = digestNext.disabled ? '0.3' : '1';
  }

  digestPrev.addEventListener('click', function () {
    if (currentDigestIndex < allDigests.length - 1) {
      digestListEl.hidden = true;
      renderDigestAtIndex(currentDigestIndex + 1);
    }
  });

  digestNext.addEventListener('click', function () {
    if (currentDigestIndex > 0) {
      digestListEl.hidden = true;
      renderDigestAtIndex(currentDigestIndex - 1);
    }
  });

  digestListBtn.addEventListener('click', function () {
    if (!digestListEl.hidden) {
      digestListEl.hidden = true;
      return;
    }

    var html = '';
    allDigests.forEach(function (entry, i) {
      var d = entry.data;
      var dateStr = d.date && d.date.toDate ?
        formatDate(d.date.toDate()) : 'unknown';
      var count = (d.itemIds ? d.itemIds.length : 0);
      html += '<div class="digest-list-item" data-digest-index="' + i + '">' +
        '<span class="digest-list-item-date">' + dateStr + '</span>' +
        '<span class="digest-list-item-count">' + count + ' item' +
        (count === 1 ? '' : 's') + '</span>' +
        '</div>';
    });
    digestListEl.innerHTML = html;
    digestListEl.hidden = false;

    digestListEl.querySelectorAll('.digest-list-item').forEach(function (el) {
      el.addEventListener('click', function () {
        renderDigestAtIndex(parseInt(el.dataset.digestIndex, 10));
        digestListEl.hidden = true;
      });
    });
  });

  function loadTodayItems() {
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    db.collection('content')
      .where('dateAdded', '>=', today)
      .orderBy('dateAdded', 'desc')
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          digestContent.innerHTML =
            '<div class="empty-state">' +
              '<p>no new items today.</p>' +
              '<p style="color: var(--text-dim);">add a url or wait for the daily digest</p>' +
            '</div>';
          return;
        }

        var header = '<div style="color: var(--text-muted); margin-bottom: var(--space-md); font-size: 0.85rem;">' +
          '> ' + snapshot.size + ' new item' + (snapshot.size === 1 ? '' : 's') + ' — digest not yet generated</div>' +
          '<hr class="divider-heavy">';

        var cards = '';
        snapshot.forEach(function (doc, i) {
          cards += renderCard(doc, i);
        });

        digestContent.innerHTML = header + cards;
        attachCardListeners(digestContent);
      })
      .catch(function (err) {
        console.error('Today items load error:', err);
        digestContent.innerHTML =
          '<div class="empty-state"><p style="color: var(--red);">error loading items</p></div>';
      });
  }

  // ---- Render: Library ----

  function loadLibrary() {
    if (!db) {
      libraryContent.innerHTML = '<div class="empty-state"><p>connecting to firebase...</p></div>';
      return;
    }

    var query = db.collection('content').orderBy('dateAdded', 'desc').limit(50);

    var source = filterSource.value;
    if (source) {
      query = db.collection('content')
        .where('sourceType', '==', source)
        .orderBy('dateAdded', 'desc')
        .limit(50);
    }

    var status = filterStatus.value;
    if (status && !source) {
      query = db.collection('content')
        .where('status', '==', status)
        .orderBy('dateAdded', 'desc')
        .limit(50);
    }

    query.get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          libraryContent.innerHTML =
            '<div class="empty-state"><p>no items match.</p></div>';
          return;
        }

        var searchTerm = (searchInput.value || '').toLowerCase();
        var cards = '';
        var count = 0;

        snapshot.forEach(function (doc) {
          var d = doc.data();
          if (searchTerm) {
            var haystack = ((d.title || '') + ' ' + (d.summary || '') + ' ' + (d.tags || []).join(' ')).toLowerCase();
            if (haystack.indexOf(searchTerm) === -1) return;
          }
          cards += renderCard(doc, count);
          count++;
        });

        if (!cards) {
          libraryContent.innerHTML =
            '<div class="empty-state"><p>no items match.</p></div>';
          return;
        }

        libraryContent.innerHTML =
          '<div style="color: var(--text-muted); margin-bottom: var(--space-md); font-size: 0.85rem;">' +
          '> ' + count + ' item' + (count === 1 ? '' : 's') + '</div>' + cards;

        attachCardListeners(libraryContent);
      })
      .catch(function (err) {
        console.error('Library load error:', err);
        libraryContent.innerHTML =
          '<div class="empty-state"><p style="color: var(--red);">error loading library</p></div>';
      });
  }

  // Debounced search
  var searchTimer;
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadLibrary, 300);
  });

  filterSource.addEventListener('change', loadLibrary);
  filterStatus.addEventListener('change', loadLibrary);

  // ---- Render: Single Item ----

  function openItem(id) {
    currentItemId = id;
    switchViewRaw('item');

    if (!db) return;

    db.collection('content').doc(id).get()
      .then(function (doc) {
        if (!doc.exists) {
          showToast('item not found', 'error');
          return;
        }

        var d = doc.data();

        document.getElementById('item-title').textContent = d.title || 'Untitled';
        document.getElementById('item-meta').innerHTML =
          renderSourceBadge(d.sourceType || 'article') +
          renderStatusBadge(d.status || 'queued') +
          (d.dateAdded ? '<span>' + timeAgo(d.dateAdded.toDate ? d.dateAdded.toDate() : new Date(d.dateAdded)) + '</span>' : '') +
          '<span>' + renderStars(d.deeperScore) + '</span>';

        document.getElementById('item-tags').innerHTML = renderTags(d.tags);

        // Extraction confidence banner
        var confEl = document.getElementById('item-confidence');
        if (!confEl) {
          confEl = document.createElement('div');
          confEl.id = 'item-confidence';
          document.getElementById('item-tags').after(confEl);
        }
        confEl.innerHTML = renderConfidenceBanner(d);

        // Embedded YouTube player (for YouTube items)
        var playerEl = document.getElementById('item-player');
        if (!playerEl) {
          playerEl = document.createElement('div');
          playerEl.id = 'item-player';
          confEl.after(playerEl);
        }
        if (d.sourceType === 'youtube' && d.sourceUrl) {
          var vid = extractYouTubeId(d.sourceUrl);
          if (vid) {
            playerEl.innerHTML =
              '<div style="margin: var(--space-md) 0;">' +
              '<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius);">' +
              '<iframe src="https://www.youtube.com/embed/' + escapeHtml(vid) + '" ' +
              'style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" ' +
              'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
              'allowfullscreen></iframe>' +
              '</div></div>';
          } else {
            playerEl.innerHTML = '';
          }
        } else {
          playerEl.innerHTML = '';
        }

        document.getElementById('item-summary').innerHTML =
          '<div class="section-header">summary</div>' +
          '<div class="card-summary" data-highlightable="summary">' +
          escapeHtml(d.summary || 'No summary yet.') + '</div>';

        if (d.deepDive) {
          document.getElementById('item-deep-dive').innerHTML =
            '<div class="section-header">deep-dive</div>' +
            '<div class="deep-dive-content" data-highlightable="deepDive">' +
            escapeHtml(d.deepDive) + '</div>';
        } else {
          document.getElementById('item-deep-dive').innerHTML = '';
        }

        // Full text (expandable)
        var ftEl = document.getElementById('item-fulltext');
        if (d.fullText) {
          ftEl.innerHTML =
            '<button class="fulltext-toggle" id="fulltext-toggle">full text</button>' +
            '<div class="fulltext-body" data-highlightable="fullText" hidden>' +
            escapeHtml(d.fullText) + '</div>';
          document.getElementById('fulltext-toggle').addEventListener('click', function () {
            var body = this.nextElementSibling;
            var isOpen = !body.hidden;
            body.hidden = isOpen;
            this.classList.toggle('open', !isOpen);
          });
        } else {
          ftEl.innerHTML = '';
        }

        document.getElementById('item-notes').value = d.notes || '';

        // Open source link — adjust for email items.
        var srcBtn = document.getElementById('btn-open-source');
        var isEmail = d.sourceUrl &&
          d.sourceUrl.startsWith('email://');
        if (isEmail) {
          srcBtn.textContent = 'via email';
          srcBtn.disabled = true;
          srcBtn.style.cursor = 'default';
          srcBtn.onclick = null;
        } else {
          srcBtn.textContent = 'open source ↗';
          srcBtn.disabled = false;
          srcBtn.style.cursor = 'pointer';
          srcBtn.onclick = function () {
            if (d.sourceUrl) {
              window.open(d.sourceUrl, '_blank');
            }
          };
        }

        // Load and render saved highlights for this item
        loadHighlightsForItem(id, d.title || 'Untitled', d.sourceType || 'article');
      })
      .catch(function (err) {
        console.error('Item load error:', err);
        showToast('error loading item', 'error');
      });
  }

  // Save notes
  document.getElementById('btn-save-notes').addEventListener('click', function () {
    if (!db || !currentItemId) return;
    var notes = document.getElementById('item-notes').value;
    db.collection('content').doc(currentItemId).update({ notes: notes })
      .then(function () { showToast('notes saved', 'success'); })
      .catch(function (err) { showToast('error saving notes', 'error'); });
  });

  // ---- Card Click Listeners ----

  function attachCardListeners(container) {
    container.querySelectorAll('[data-action="open"]').forEach(function (el) {
      el.addEventListener('click', function () {
        openItem(el.dataset.id);
      });
    });
  }

  // Switch view without triggering data load (for item view)
  function switchViewRaw(name) {
    currentView = name;
    views.forEach(function (v) { v.hidden = v.id !== 'view-' + name; });
    // Don't update nav active state for item view
    if (name !== 'item') {
      navLinks.forEach(function (a) {
        a.classList.toggle('active', a.dataset.view === name);
      });
    }
  }

  // ---- URL Submission ----

  urlForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var url = urlInput.value.trim();
    if (!url) return;

    submitStatus.innerHTML = '<span class="loading">processing</span>';

    fetch(apiBase + '/api/processUrl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.status === 'processed') {
          submitStatus.innerHTML =
            '<span style="color: var(--green);">processed: ' +
            escapeHtml(data.title || '') + '</span>' +
            '<div style="margin-top: var(--space-sm); font-size: 0.85rem; color: var(--text-muted);">' +
            escapeHtml(data.summary || '') + '</div>' +
            (data.tags ? '<div style="margin-top: var(--space-sm);">' + renderTags(data.tags) + '</div>' : '');
        } else if (data.status === 'failed') {
          submitStatus.innerHTML =
            '<span style="color: var(--yellow);">queued but extraction failed: ' +
            escapeHtml(data.error || 'unknown error') + '</span>';
        } else {
          submitStatus.innerHTML =
            '<span style="color: var(--red);">error: ' +
            escapeHtml(data.error || 'unknown error') + '</span>';
        }
        urlInput.value = '';
        setTimeout(function () { submitStatus.innerHTML = ''; }, 8000);
      })
      .catch(function (err) {
        submitStatus.innerHTML =
          '<span style="color: var(--red);">error: ' +
          escapeHtml(err.message) + '</span>';
      });
  });


  // ---- RSS Feeds Management ----

  var feedForm = document.getElementById('feed-form');
  var feedUrlInput = document.getElementById('feed-url-input');
  var feedNameInput = document.getElementById('feed-name-input');
  var feedsList = document.getElementById('feeds-list');

  if (feedForm) {
    feedForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var feedUrl = feedUrlInput.value.trim();
      var feedName = feedNameInput.value.trim();
      if (!feedUrl || !feedName || !db) return;

      db.collection('feeds').add({
        url: feedUrl,
        name: feedName,
        lastChecked: null
      }).then(function () {
        feedUrlInput.value = '';
        feedNameInput.value = '';
        showToast('feed added', 'success');
        loadFeeds();
      }).catch(function (err) {
        showToast('error: ' + err.message, 'error');
      });
    });
  }

  function loadFeeds() {
    if (!db || !feedsList) return;

    db.collection('feeds').get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          feedsList.innerHTML =
            '<div style="color: var(--text-dim); ' +
            'font-size: 0.85rem; margin-top: var(--space-md);">' +
            'no feeds configured</div>';
          return;
        }

        var html = '';
        snapshot.forEach(function (doc) {
          var f = doc.data();
          var checked = f.lastChecked && f.lastChecked.toDate
            ? timeAgo(f.lastChecked.toDate())
            : 'never';
          html += '<div class="feed-item">';
          html += '<div class="feed-item-info">';
          html += '<span class="feed-item-name">' +
            escapeHtml(f.name) + '</span>';
          html += '<span class="feed-item-url">' +
            escapeHtml(f.url) + '</span>';
          html += '<span class="feed-item-checked">' +
            'last checked: ' + checked + '</span>';
          html += '</div>';
          html += '<button class="highlight-entry-delete" ' +
            'data-feed-id="' + doc.id + '">x</button>';
          html += '</div>';
        });

        feedsList.innerHTML = html;

        // Attach delete listeners.
        feedsList.querySelectorAll(
          '[data-feed-id]'
        ).forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.dataset.feedId;
            if (!db || !id) return;
            db.collection('feeds').doc(id).delete()
              .then(function () {
                showToast('feed removed', 'success');
                loadFeeds();
              })
              .catch(function () {
                showToast('error removing feed', 'error');
              });
          });
        });
      });
  }

  // Load feeds when switching to add view.
  var origSwitchViewForFeeds = switchView;
  switchView = function (name) {
    origSwitchViewForFeeds(name);
    if (name === 'add') loadFeeds();
  };

  // ---- Highlighting ----

  var highlightBar = document.getElementById('highlight-bar');
  var highlightPreview = document.getElementById('highlight-preview');
  var btnSaveHighlight = document.getElementById('btn-save-highlight');
  var currentItemTitle = '';
  var currentItemSourceType = '';
  var selectionTimer = null;

  function getHighlightZone() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;

    // Check anchor node
    var node = sel.anchorNode;
    var zone = null;
    if (node) {
      var el = node.nodeType === 3 ? node.parentElement : node;
      if (el) zone = el.closest('[data-highlightable]');
    }
    // Also check focus node
    if (!zone && sel.focusNode) {
      var el2 = sel.focusNode.nodeType === 3
        ? sel.focusNode.parentElement : sel.focusNode;
      if (el2) zone = el2.closest('[data-highlightable]');
    }
    return zone;
  }

  // Store the last valid selection so we don't lose it
  // when the user taps the save button (which clears selection).
  var pendingHighlight = null;

  // Guard: don't update selection state while saving
  var isSaving = false;

  function updateSelectionState() {
    if (isSaving) return;

    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || currentView !== 'item') {
      highlightBar.hidden = true;
      return;
    }

    var text = sel.toString().trim();
    if (text.length < 3) {
      highlightBar.hidden = true;
      return;
    }

    var zone = getHighlightZone();
    if (!zone) {
      highlightBar.hidden = true;
      return;
    }

    // Valid selection found — capture everything now
    var section = zone.getAttribute('data-highlightable');
    var range = sel.getRangeAt(0).cloneRange();

    // Get surrounding context
    var context = '';
    var anchor = sel.anchorNode;
    var parentP = anchor && anchor.parentElement
      ? anchor.parentElement.closest('p') : null;
    if (parentP) {
      context = parentP.textContent;
    } else {
      var zoneText = zone.textContent;
      var idx = zoneText.indexOf(text);
      if (idx !== -1) {
        var start = Math.max(0, idx - 100);
        var end = Math.min(
          zoneText.length, idx + text.length + 100
        );
        context = zoneText.substring(start, end);
      } else {
        context = text;
      }
    }

    pendingHighlight = {
      text: text,
      section: section,
      context: context,
      range: range
    };

    highlightPreview.textContent = text.length > 60
      ? text.substring(0, 60) + '...'
      : text;
    highlightBar.hidden = false;
  }

  // Multiple event listeners for Android compatibility.
  document.addEventListener('selectionchange', function () {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(updateSelectionState, 150);
  });

  document.addEventListener('mouseup', function (e) {
    // Ignore clicks on the highlight bar itself
    if (highlightBar.contains(e.target)) return;
    setTimeout(updateSelectionState, 200);
  });

  document.addEventListener('touchend', function (e) {
    if (highlightBar.contains(e.target)) return;
    setTimeout(updateSelectionState, 300);
  });

  // Prevent the save button from clearing the selection
  // by stopping mousedown propagation.
  btnSaveHighlight.addEventListener('mousedown', function (e) {
    e.preventDefault();
  });

  // Save highlight — uses the stored pendingHighlight
  // since tapping this button clears the browser selection.
  btnSaveHighlight.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    isSaving = true;

    if (!pendingHighlight || !db || !currentItemId) {
      showToast('no text selected', 'error');
      return;
    }

    var h = pendingHighlight;

    // Write to Firestore
    db.collection('highlights').add({
      contentId: currentItemId,
      contentTitle: currentItemTitle,
      sourceType: currentItemSourceType,
      highlightedText: h.text,
      surroundingContext: h.context,
      section: h.section,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      // Visually mark the text in the article
      try {
        var mark = document.createElement('mark');
        h.range.surroundContents(mark);
      } catch (e2) {
        // Fall back to string-matching approach
        applyHighlightMark(h.text, h.section);
      }
      // Clear state
      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      pendingHighlight = null;
      highlightBar.hidden = true;
      isSaving = false;
      showToast('highlight saved', 'success');
    }).catch(function (err) {
      console.error('Save highlight error:', err);
      showToast('error saving highlight', 'error');
      isSaving = false;
    });
  });

  // Load and re-render saved highlights for an item
  function loadHighlightsForItem(contentId, title, sourceType) {
    currentItemTitle = title;
    currentItemSourceType = sourceType;

    if (!db) return;

    db.collection('highlights')
      .where('contentId', '==', contentId)
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) return;

        snapshot.forEach(function (doc) {
          var h = doc.data();
          applyHighlightMark(h.highlightedText, h.section);
        });
      })
      .catch(function (err) {
        console.error('Load highlights error:', err);
      });
  }

  // Apply a <mark> to matching text in a highlightable zone
  function applyHighlightMark(text, section) {
    var zone = document.querySelector(
      '[data-highlightable="' + section + '"]'
    );
    if (!zone) return;

    var walker = document.createTreeWalker(
      zone, NodeFilter.SHOW_TEXT, null, false
    );
    var node;
    while ((node = walker.nextNode())) {
      var idx = node.textContent.indexOf(text);
      if (idx === -1) continue;

      var range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + text.length);
      var mark = document.createElement('mark');
      try {
        range.surroundContents(mark);
      } catch (e) {
        // Skip if range crosses element boundaries
      }
      return; // Only mark first occurrence
    }
  }

  // ---- Render: Highlights View ----

  var highlightsContent = document.getElementById('highlights-content');

  // Tab switching
  var highlightTabs = document.querySelectorAll('.highlight-tab');
  highlightTabs.forEach(function (tab) {
    tab.addEventListener('click', function (e) {
      e.preventDefault();
      highlightTabs.forEach(function (t) {
        t.classList.remove('active');
      });
      tab.classList.add('active');
      loadHighlights();
    });
  });

  function loadHighlights() {
    if (!db) {
      highlightsContent.innerHTML =
        '<div class="empty-state"><p>connecting...</p></div>';
      return;
    }

    db.collection('highlights')
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          highlightsContent.innerHTML =
            '<div class="empty-state">' +
            '<p>no highlights yet.</p>' +
            '<p style="color: var(--text-dim);">' +
            'open an article and select text to highlight</p>' +
            '</div>';
          return;
        }

        var activeTab = document.querySelector('.highlight-tab.active');
        var mode = activeTab ? activeTab.dataset.tab : 'by-article';

        var highlights = [];
        snapshot.forEach(function (doc) {
          var d = doc.data();
          d._id = doc.id;
          highlights.push(d);
        });

        if (mode === 'by-article') {
          renderHighlightsByArticle(highlights);
        } else {
          renderHighlightsByTheme(highlights);
        }
      })
      .catch(function (err) {
        console.error('Highlights load error:', err);
        highlightsContent.innerHTML =
          '<div class="empty-state">' +
          '<p style="color: var(--red);">error loading highlights</p>' +
          '</div>';
      });
  }

  function renderHighlightsByArticle(highlights) {
    // Group by contentId
    var groups = {};
    highlights.forEach(function (h) {
      var key = h.contentId || 'unknown';
      if (!groups[key]) {
        groups[key] = {
          title: h.contentTitle || 'Untitled',
          contentId: h.contentId,
          items: []
        };
      }
      groups[key].items.push(h);
    });

    var html = '';
    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      html += '<div class="highlight-group">';
      html += '<div class="highlight-group-title" ' +
        'data-action="open" data-id="' +
        escapeHtml(group.contentId) + '">' +
        escapeHtml(group.title) + '</div>';

      group.items.forEach(function (h) {
        html += '<div class="highlight-entry">';
        html += '<div class="highlight-entry-text">' +
          escapeHtml(h.highlightedText) + '</div>';
        if (h.surroundingContext &&
            h.surroundingContext !== h.highlightedText) {
          html += '<div class="highlight-entry-context">...' +
            escapeHtml(h.surroundingContext.substring(0, 150)) +
            '...</div>';
        }
        html += '<button class="highlight-entry-delete" ' +
          'data-highlight-id="' + h._id + '">x</button>';
        html += '</div>';
      });

      html += '</div>';
    });

    highlightsContent.innerHTML = html;
    attachCardListeners(highlightsContent);
    attachHighlightDeleteListeners();
  }

  function attachHighlightDeleteListeners() {
    highlightsContent.querySelectorAll(
      '.highlight-entry-delete'
    ).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = btn.dataset.highlightId;
        if (!db || !id) return;
        db.collection('highlights').doc(id).delete()
          .then(function () {
            showToast('highlight removed', 'success');
            loadHighlights();
          })
          .catch(function () {
            showToast('error removing highlight', 'error');
          });
      });
    });
  }

  function renderHighlightsByTheme(highlights) {
    if (!db) return;

    // Load learning profile first
    db.collection('learningProfile').doc('current').get()
      .then(function (doc) {
        if (!doc.exists) {
          highlightsContent.innerHTML =
            '<div class="empty-state">' +
            '<p>no learning profile yet.</p>' +
            '<p style="color: var(--text-dim);">' +
            'need at least 5 highlights to generate one</p>' +
            '<button class="btn btn--primary" ' +
            'id="btn-generate-profile" style="margin-top: 16px;">' +
            'generate profile</button>' +
            '</div>';
          attachProfileButton();
          return;
        }

        var p = doc.data();
        var html = '';

        // Profile summary
        html += '<div class="profile-summary">';
        html += '<div class="section-header">learning profile</div>';
        html += '<div style="color: var(--text-muted); ' +
          'font-size: 0.85rem; line-height: 1.6; ' +
          'margin-bottom: var(--space-lg);">' +
          escapeHtml(p.rawSummary || '') + '</div>';

        // Interests
        if (p.interests && p.interests.length > 0) {
          html += '<div class="section-header">interests</div>';
          p.interests.forEach(function (interest) {
            var strengthColor = interest.strength === 'strong'
              ? 'var(--green)' : interest.strength === 'moderate'
                ? 'var(--yellow)' : 'var(--text-dim)';
            html += '<div class="highlight-entry">';
            html += '<div class="highlight-entry-text">' +
              '<span style="color: ' + strengthColor + ';">' +
              escapeHtml(interest.topic) + '</span>' +
              ' <span style="color: var(--text-dim); ' +
              'font-size: 0.75rem;">(' +
              interest.evidenceCount + ' highlights, ' +
              interest.strength + ')</span></div>';
            html += '<div class="highlight-entry-context">' +
              escapeHtml(interest.exampleHighlight) + '</div>';
            html += '</div>';
          });
        }

        // Knowledge gaps
        if (p.knowledgeGaps && p.knowledgeGaps.length > 0) {
          html += '<div class="section-header" ' +
            'style="margin-top: var(--space-xl);">gaps</div>';
          p.knowledgeGaps.forEach(function (gap) {
            html += '<div class="highlight-entry">';
            html += '<div class="highlight-entry-text">' +
              escapeHtml(gap.topic) + '</div>';
            html += '<div class="highlight-entry-context">' +
              escapeHtml(gap.signal) + '</div>';
            html += '</div>';
          });
        }

        // Patterns
        if (p.patterns && p.patterns.length > 0) {
          html += '<div class="section-header" ' +
            'style="margin-top: var(--space-xl);">patterns</div>';
          p.patterns.forEach(function (pat) {
            html += '<div class="highlight-entry">';
            html += '<div class="highlight-entry-text">' +
              escapeHtml(pat) + '</div>';
            html += '</div>';
          });
        }

        html += '</div>';

        // Regenerate button
        html += '<div style="margin-top: var(--space-xl); ' +
          'text-align: center;">';
        html += '<button class="btn" id="btn-generate-profile">' +
          'regenerate profile</button>';
        html += '<div style="color: var(--text-dim); ' +
          'font-size: 0.75rem; margin-top: var(--space-sm);">' +
          'based on ' + (p.highlightCount || 0) +
          ' highlights</div>';
        html += '</div>';

        highlightsContent.innerHTML = html;
        attachProfileButton();
      })
      .catch(function (err) {
        console.error('Profile load error:', err);
        highlightsContent.innerHTML =
          '<div class="empty-state">' +
          '<p style="color: var(--red);">error loading profile</p>' +
          '</div>';
      });
  }

  function attachProfileButton() {
    var btn = document.getElementById('btn-generate-profile');
    if (!btn) return;
    btn.addEventListener('click', function () {
      btn.textContent = 'generating...';
      btn.disabled = true;
      fetch(apiBase + '/api/updateLearningProfile', {
        method: 'POST'
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.error) {
            showToast('error: ' + data.error, 'error');
          } else {
            showToast('profile updated', 'success');
            loadHighlights();
          }
        })
        .catch(function (err) {
          showToast('error: ' + err.message, 'error');
        })
        .finally(function () {
          btn.textContent = 'regenerate profile';
          btn.disabled = false;
        });
    });
  }

  // Hide highlight bar when leaving item view
  var origSwitchView = switchView;
  switchView = function (name) {
    highlightBar.hidden = true;
    origSwitchView(name);
  };

  // ---- Hash Routing ----

  function handleHash() {
    var hash = window.location.hash.replace('#', '') || 'digest';
    if (['digest', 'library', 'add', 'highlights'].indexOf(hash) !== -1) {
      switchView(hash);
    }
  }

  window.addEventListener('hashchange', handleHash);

  // ---- Init ----

  document.addEventListener('DOMContentLoaded', function () {
    try {
      firebase.app();
      db = firebase.firestore();
      handleHash();
    } catch (e) {
      console.error('Firebase init error:', e);
      handleHash();
    }
  });

})();
