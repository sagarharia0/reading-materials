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

  function loadDigest() {
    digestDate.textContent = formatDate(new Date());

    if (!db) {
      digestContent.innerHTML = '<div class="empty-state"><p>connecting to firebase...</p></div>';
      return;
    }

    // Try to load the latest generated digest first.
    db.collection('digests')
      .orderBy('date', 'desc')
      .limit(1)
      .get()
      .then(function (snapshot) {
        if (!snapshot.empty) {
          var digest = snapshot.docs[0].data();
          var dateStr = digest.date && digest.date.toDate ? formatDate(digest.date.toDate()) : '';
          digestDate.textContent = dateStr;
          digestContent.innerHTML = digest.htmlContent || '<div class="empty-state"><p>digest is empty</p></div>';
          attachCardListeners(digestContent);
          return;
        }

        // No generated digest yet — fall back to showing today's items.
        loadTodayItems();
      })
      .catch(function (err) {
        console.error('Digest load error:', err);
        // Fall back to today's items on error.
        loadTodayItems();
      });
  }

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

        // Open source link
        document.getElementById('btn-open-source').onclick = function () {
          if (d.sourceUrl) window.open(d.sourceUrl, '_blank');
        };

        // Load and render saved highlights for this item
        loadHighlightsForItem(id, d.title || 'Untitled', d.sourceType || 'article');
      })
      .catch(function (err) {
        console.error('Item load error:', err);
        showToast('error loading item', 'error');
      });
  }

  // Go deeper button
  document.getElementById('btn-go-deeper').addEventListener('click', function () {
    if (!currentItemId) return;
    this.textContent = 'processing...';
    this.disabled = true;
    var btn = this;

    fetch(apiBase + '/api/goDeeper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: currentItemId })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) {
          showToast('error: ' + data.error, 'error');
        } else {
          showToast('deep dive generated', 'success');
          openItem(currentItemId);
        }
      })
      .catch(function (err) {
        console.error('Go deeper error:', err);
        showToast('error: ' + err.message, 'error');
      })
      .finally(function () {
        btn.textContent = 'go-deeper';
        btn.disabled = false;
      });
  });

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
          renderHighlightsByArticle(highlights);
          // Theme view will use learning profile later
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
