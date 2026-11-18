/*
 * Julkul – lyckohjul för julkalenderdragningen.
 *
 * Deltagarna läses från names.json. Vinnare, vilka som är borta idag och
 * dagens gäster sparas i webbläsarens localStorage (alltså på TV:n).
 *
 * Testa ett visst datum genom att lägga till ?datum=2026-12-05 i adressen.
 *
 * Koden är medvetet skriven i "gammal" JavaScript (ES5) så att den fungerar
 * även i äldre TV-webbläsare.
 */
(function () {
  'use strict';

  // Används bara om names.json inte går att läsa
  var FALLBACK_NAMES = ['John', 'Daniel', 'Wallberg', 'Niklas', 'PO', 'Tommy', 'Gustav',
    'Ivan', 'Denny', 'Tobias', 'Larsson', 'Martin', 'Johan W'];

  var STORAGE_KEY = 'julkul_v2';
  var LAST_LUCKA = 24;
  var MAX_ROTATION_SPEED = 450;   // grader per sekund
  var ROTATION_RESISTANCE = 45;   // inbromsning, grader per sekund^2
  var POINTER_ANGLE = 270;        // pilen sitter högst upp
  var WEDGE_COLORS = ['#006400', '#FFD700', '#B22222'];
  var LAST_WEDGE_COLOR = '#001F3F';
  var BLANK_MESSAGE = 'Jaha, ingen på plats idag?';

  var raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame ||
    function (cb) { return window.setTimeout(cb, 16); };

  // DOM
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  var spinBtn = document.getElementById('spin-wheel');
  var luckaPrev = document.getElementById('lucka-prev');
  var luckaNext = document.getElementById('lucka-next');
  var luckaLabel = document.getElementById('lucka-label');
  var luckaInfo = document.getElementById('lucka-info');
  var nameListEl = document.getElementById('name-list');
  var winnerListEl = document.getElementById('winner-list');
  var nameInput = document.getElementById('name-input');
  var addNameBtn = document.getElementById('add-name');
  var resetBtn = document.getElementById('reset-winners');
  var overlay = document.getElementById('overlay');
  var overlayName = document.getElementById('overlay-name');
  var overlayLucka = document.getElementById('overlay-lucka');
  var overlayOk = document.getElementById('overlay-ok');
  var overlayRespin = document.getElementById('overlay-respin');

  // Tillstånd
  var today = getToday();
  var testMode = !(today.month === 12 && today.day >= 1 && today.day <= LAST_LUCKA);
  var lucka = testMode ? null : today.day;
  var baseNames = FALLBACK_NAMES.slice();
  var state = loadState();
  var wheelNames = [];
  var rotation = Math.random() * 360;
  var speed = 0;
  var spinning = false;
  var lastTime = 0;
  var pendingWinner = null;
  var overlayOpen = false;
  var size = 500;
  var dpr = 1;

  // ---------- Datum och lagring ----------

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function getToday() {
    var m = /[?&]datum=(\d{4})-(\d{1,2})-(\d{1,2})/.exec(window.location.search);
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      iso: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    };
  }

  function isArray(x) {
    return Object.prototype.toString.call(x) === '[object Array]';
  }

  function loadState() {
    var s = null;
    try {
      s = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      s = null;
    }
    if (!s || typeof s !== 'object') s = {};

    // Nytt år = nya vinnare
    if (s.year !== today.year || !isArray(s.history)) {
      s.year = today.year;
      s.history = [];
    }
    // "Borta idag" och gäster gäller bara en dag
    if (!s.absent || s.absent.date !== today.iso || !isArray(s.absent.names)) {
      s.absent = { date: today.iso, names: [] };
    }
    if (!s.guests || s.guests.date !== today.iso || !isArray(s.guests.names)) {
      s.guests = { date: today.iso, names: [] };
    }
    return s;
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Lagring avstängd – appen fungerar ändå, men minns inget
    }
  }

  function loadNames(done) {
    var xhr;
    try {
      xhr = new XMLHttpRequest();
      xhr.open('GET', 'names.json?v=' + Date.now(), true);
    } catch (e) {
      done();
      return;
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          var list = isArray(data) ? data : data && data.deltagare;
          var clean = [];
          if (isArray(list)) {
            for (var i = 0; i < list.length; i++) {
              var n = String(list[i]).replace(/^\s+|\s+$/g, '');
              if (n && clean.indexOf(n) < 0) clean.push(n);
            }
          }
          if (clean.length) baseNames = clean;
        } catch (e) {
          // Felaktig JSON – använd reservlistan
        }
      }
      done();
    };
    xhr.send();
  }

  // ---------- Vem är med i hjulet? ----------

  function participants() {
    var all = baseNames.slice();
    for (var i = 0; i < state.guests.names.length; i++) {
      if (all.indexOf(state.guests.names[i]) < 0) all.push(state.guests.names[i]);
    }
    return all;
  }

  function isAbsent(name) {
    return state.absent.names.indexOf(name) >= 0;
  }

  function isGuest(name) {
    return baseNames.indexOf(name) < 0 && state.guests.names.indexOf(name) >= 0;
  }

  function luckorWonBy(name) {
    var res = [];
    for (var i = 0; i < state.history.length; i++) {
      if (state.history[i].namn === name) res.push(state.history[i].lucka);
    }
    res.sort(function (a, b) { return a - b; });
    return res;
  }

  function historyFor(l) {
    for (var i = 0; i < state.history.length; i++) {
      if (state.history[i].lucka === l) return state.history[i];
    }
    return null;
  }

  // Alla som är på plats är med i hjulet varje dag – samma chans för alla,
  // oavsett om man vunnit tidigare.
  function computeWheel() {
    var all = participants();
    var res = [];
    for (var i = 0; i < all.length; i++) {
      if (!isAbsent(all[i])) res.push(all[i]);
    }
    return res;
  }

  // ---------- Panelen ----------

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function renderPanel() {
    var i;

    // Lucka
    if (testMode) {
      luckaLabel.textContent = 'Testdragning';
      luckaInfo.textContent = 'Det är inte 1–24 december, så inget sparas.';
      luckaPrev.disabled = true;
      luckaNext.disabled = true;
    } else {
      luckaLabel.textContent = 'Lucka ' + lucka;
      var existing = historyFor(lucka);
      if (existing) {
        luckaInfo.textContent = 'Redan dragen: ' + existing.namn + ' (snurra för att dra om)';
      } else if (lucka === today.day) {
        luckaInfo.textContent = 'Dagens lucka';
      } else if (lucka < today.day) {
        luckaInfo.textContent = 'Lucka från en tidigare dag';
      } else {
        luckaInfo.textContent = 'Lucka för en kommande dag';
      }
      luckaPrev.disabled = lucka <= 1;
      luckaNext.disabled = lucka >= LAST_LUCKA;
    }

    // Deltagare
    nameListEl.innerHTML = '';
    var all = participants();
    for (i = 0; i < all.length; i++) {
      (function (name) {
        var btn = el('button', 'list-item');
        btn.appendChild(el('span', '', name));
        var tag = '';
        if (isAbsent(name)) {
          btn.className += ' absent';
          tag = 'borta idag';
        } else {
          var won = luckorWonBy(name);
          if (isGuest(name)) tag = 'gäst';
          if (won.length) tag += (tag ? ', ' : '') + 'vann lucka ' + won.join(', ');
        }
        if (tag) btn.appendChild(el('span', 'tag', tag));
        btn.setAttribute('data-name', name);
        btn.onclick = function () { toggleName(name); };
        nameListEl.appendChild(btn);
      })(all[i]);
    }

    // Vinnare
    winnerListEl.innerHTML = '';
    var hist = state.history.slice().sort(function (a, b) { return a.lucka - b.lucka; });
    if (!hist.length) {
      winnerListEl.appendChild(el('div', 'list-empty', 'Inga vinnare än'));
    }
    for (i = 0; i < hist.length; i++) {
      (function (h) {
        var btn = el('button', 'list-item');
        btn.appendChild(el('span', '', 'Lucka ' + h.lucka + ': ' + h.namn));
        btn.appendChild(el('span', 'tag', '✕'));
        btn.onclick = function () { removeWinner(h); };
        winnerListEl.appendChild(btn);
      })(hist[i]);
    }

    resetBtn.style.display = state.history.length ? '' : 'none';
    spinBtn.disabled = spinning || !wheelNames.length;
  }

  function refresh() {
    wheelNames = computeWheel();
    renderPanel();
    draw();
  }

  function toggleName(name) {
    if (spinning) return;
    if (isGuest(name)) {
      // Gäster tas bort helt när man trycker på dem
      state.guests.names.splice(state.guests.names.indexOf(name), 1);
    } else {
      var idx = state.absent.names.indexOf(name);
      if (idx >= 0) state.absent.names.splice(idx, 1);
      else state.absent.names.push(name);
    }
    saveState();
    refresh();
    // Listan ritas om – behåll markeringen så att nästa OK inte snurrar hjulet av misstag
    var items = nameListEl.getElementsByTagName('button');
    var target = spinBtn;
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute('data-name') === name) target = items[i];
    }
    try { target.focus(); } catch (e) { /* ignorera */ }
  }

  function addGuest() {
    var name = nameInput.value.replace(/^\s+|\s+$/g, '');
    if (!name || spinning) return;
    if (participants().indexOf(name) < 0) state.guests.names.push(name);
    var a = state.absent.names.indexOf(name);
    if (a >= 0) state.absent.names.splice(a, 1);
    nameInput.value = '';
    saveState();
    refresh();
  }

  function removeWinner(h) {
    if (spinning) return;
    if (!window.confirm('Ta bort ' + h.namn + ' som vinnare av lucka ' + h.lucka + '?')) return;
    var idx = state.history.indexOf(h);
    if (idx >= 0) state.history.splice(idx, 1);
    saveState();
    refresh();
    try { spinBtn.focus(); } catch (e) { /* ignorera */ }
  }

  function resetWinners() {
    if (spinning) return;
    if (!window.confirm('Ta bort alla vinnare för i år?')) return;
    state.history = [];
    saveState();
    refresh();
    try { spinBtn.focus(); } catch (e) { /* ignorera */ }
  }

  function changeLucka(delta) {
    if (testMode || spinning) return;
    var next = lucka + delta;
    if (next < 1 || next > LAST_LUCKA) return;
    lucka = next;
    refresh();
  }

  // ---------- Hjulet ----------

  function degRad(deg) {
    return deg * Math.PI / 180;
  }

  function wedgeColor(i, n) {
    if (n > 1 && i === n - 1) return LAST_WEDGE_COLOR;
    return WEDGE_COLORS[i % WEDGE_COLORS.length];
  }

  function resize() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    if (vw <= 700) {
      size = Math.min(vw * 0.92, 560);
    } else {
      size = Math.min(vh * 0.85, vw * 0.6);
    }
    size = Math.max(200, Math.floor(size));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    draw();
  }

  function draw() {
    var cx = size / 2;
    var cy = size / 2;
    var R = size / 2 * 0.9;
    var n = wheelNames.length;
    var i;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Kant
    ctx.beginPath();
    ctx.arc(cx, cy, R + size * 0.025, 0, Math.PI * 2);
    ctx.fillStyle = '#1b1b1b';
    ctx.fill();

    if (!n) {
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.fillStyle = '#1b1b1b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = Math.round(size / 22) + 'px "Josefin Sans", Arial, sans-serif';
      ctx.fillText(BLANK_MESSAGE, cx, cy);
      drawPointer(cx, cy, R);
      return;
    }

    var sub = 360 / n;

    // Tårtbitar
    for (i = 0; i < n; i++) {
      var start = degRad(rotation + i * sub);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, start, start + degRad(sub));
      ctx.closePath();
      ctx.fillStyle = wedgeColor(i, n);
      ctx.fill();
      if (n > 1) {
        ctx.lineWidth = Math.max(1, size * 0.004);
        ctx.strokeStyle = '#CDCDCD';
        ctx.stroke();
      }
    }

    // Namn – krymps så att de får plats i sin bit
    var maxWidth = R * 0.72;
    var arcHeight = 2 * (R * 0.62) * Math.sin(degRad(Math.min(sub, 90) / 2));
    var baseFont = Math.min(R * 0.14, arcHeight * 0.75);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (i = 0; i < n; i++) {
      var fontSize = baseFont;
      ctx.font = 'bold ' + fontSize + 'px "Josefin Sans", Arial, sans-serif';
      var w = ctx.measureText(wheelNames[i]).width;
      if (w > maxWidth) {
        fontSize = Math.max(10, fontSize * maxWidth / w);
        ctx.font = 'bold ' + fontSize + 'px "Josefin Sans", Arial, sans-serif';
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(degRad(rotation + (i + 0.5) * sub));
      ctx.fillStyle = wedgeColor(i, n) === '#FFD700' ? '#1b1b1b' : '#ffffff';
      ctx.fillText(wheelNames[i], R * 0.92, 0);
      ctx.restore();
    }

    // Nav i mitten
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(2, size * 0.008);
    ctx.strokeStyle = '#1b1b1b';
    ctx.stroke();

    drawPointer(cx, cy, R);
  }

  function drawPointer(cx, cy, R) {
    var top = cy - R - size * 0.045;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.04, top);
    ctx.lineTo(cx + size * 0.04, top);
    ctx.lineTo(cx, cy - R + size * 0.06);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(2, size * 0.006);
    ctx.strokeStyle = '#1b1b1b';
    ctx.stroke();
  }

  function winnerIndex() {
    var n = wheelNames.length;
    var sub = 360 / n;
    var a = ((POINTER_ANGLE - rotation) % 360 + 360) % 360;
    return Math.min(n - 1, Math.floor(a / sub));
  }

  function spin() {
    if (spinning || overlayOpen || !wheelNames.length) return;
    speed = MAX_ROTATION_SPEED * (0.6 + 0.4 * Math.random());
    spinning = true;
    spinBtn.disabled = true;
    lastTime = Date.now();
    raf(frame);
  }

  function frame() {
    var now = Date.now();
    var dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.1) dt = 0.1; // om fliken pausats

    rotation = (rotation + speed * dt) % 360;
    speed -= ROTATION_RESISTANCE * dt;

    if (speed <= 0) {
      speed = 0;
      spinning = false;
      draw();
      onStop();
      return;
    }
    draw();
    raf(frame);
  }

  // ---------- Vinnarrutan ----------

  function onStop() {
    pendingWinner = wheelNames[winnerIndex()];
    overlayName.textContent = pendingWinner;
    if (testMode) {
      overlayLucka.textContent = 'Testdragning – inget sparas';
      overlayOk.textContent = 'OK';
    } else {
      overlayLucka.textContent = 'Öppna lucka ' + lucka + '!';
      overlayOk.textContent = 'Spara vinnaren';
    }
    overlay.className = '';
    overlayOpen = true;
    try { overlayOk.focus(); } catch (e) { /* ignorera */ }
  }

  function closeOverlay() {
    overlay.className = 'hidden';
    overlayOpen = false;
    pendingWinner = null;
  }

  function acceptWinner() {
    if (!overlayOpen) return;
    if (!testMode && pendingWinner) {
      var existing = historyFor(lucka);
      if (existing) state.history.splice(state.history.indexOf(existing), 1);
      state.history.push({ lucka: lucka, namn: pendingWinner, datum: today.iso });
      saveState();
    }
    closeOverlay();
    refresh();
    try { spinBtn.focus(); } catch (e) { /* ignorera */ }
  }

  function respin() {
    closeOverlay();
    refresh();
    spin();
  }

  // ---------- Fjärrkontroll / tangentbord ----------

  function focusables() {
    var nodes = document.querySelectorAll('.panel button, .panel input');
    var res = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n.disabled && n.offsetParent !== null) res.push(n);
    }
    return res;
  }

  function moveFocus(dir) {
    var list = focusables();
    if (!list.length) return;
    var idx = list.indexOf(document.activeElement);
    var next = idx < 0 ? list.indexOf(spinBtn) : idx + dir;
    if (next < 0) next = 0;
    if (next >= list.length) next = list.length - 1;
    list[next].focus();
  }

  function onKeyDown(e) {
    var k = e.keyCode;
    var active = document.activeElement;
    var typing = active && active.tagName === 'INPUT';

    if (overlayOpen) {
      if (k >= 37 && k <= 40) {
        (active === overlayOk ? overlayRespin : overlayOk).focus();
        e.preventDefault();
      } else if (k === 13 && active !== overlayOk && active !== overlayRespin) {
        acceptWinner();
        e.preventDefault();
      } else if (k === 27) {
        closeOverlay();
        refresh();
      }
      return;
    }

    if (typing) {
      if (k === 13) {
        addGuest();
        e.preventDefault();
      } else if (k === 38 || k === 40) {
        moveFocus(k === 40 ? 1 : -1);
        e.preventDefault();
      }
      return;
    }

    if (k === 13 || k === 32) {
      // Enter på en knapp klickar på knappen; annars snurrar vi
      if (!active || active === document.body || active === canvas) {
        spin();
        e.preventDefault();
      }
    } else if (k === 38 || k === 40) {
      moveFocus(k === 40 ? 1 : -1);
      e.preventDefault();
    } else if (k === 37 || k === 39) {
      changeLucka(k === 39 ? 1 : -1);
      e.preventDefault();
    }
  }

  // ---------- Start ----------

  function init() {
    spinBtn.onclick = spin;
    canvas.onclick = spin;
    luckaPrev.onclick = function () { changeLucka(-1); };
    luckaNext.onclick = function () { changeLucka(1); };
    addNameBtn.onclick = addGuest;
    resetBtn.onclick = resetWinners;
    overlayOk.onclick = acceptWinner;
    overlayRespin.onclick = respin;
    document.addEventListener('keydown', onKeyDown);

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 100);
    });

    saveState();
    refresh();
    resize();
    try { spinBtn.focus(); } catch (e) { /* ignorera */ }

    // Rita om när typsnittet laddats, annars kan namnen mätas med fel typsnitt
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(draw);
    }
  }

  loadNames(init);
})();
