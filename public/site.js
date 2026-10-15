// Gallery viewer and back-to-top button. No dependencies.
(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
  var DURATION = reduceMotion ? 0 : 320;

  // ---------- back to top ----------
  // Hidden (opacity 0, scale 0) near the top, shown once the page has scrolled.
  var toTop = document.querySelector(".to-top");
  if (toTop) {
    var update = function () {
      toTop.classList.toggle("show", window.scrollY > 300);
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  // ---------- "On this page" highlight ----------
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    var targets = tocLinks.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });
    var setActive = function () {
      // The active section is the last one whose top has passed a line 30% down the screen.
      var line = window.innerHeight * 0.3;
      var current = 0;
      targets.forEach(function (t, i) { if (t && t.getBoundingClientRect().top <= line) current = i; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = targets.length - 1;
      tocLinks.forEach(function (a, i) {
        a.classList.toggle("active", i === current);
        if (i === current) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
    };
    window.addEventListener("scroll", setActive, { passive: true });
    window.addEventListener("resize", setActive);
    setActive();
    tocLinks.forEach(function (a) {
      a.addEventListener("click", function (e) {
        var t = document.getElementById(a.getAttribute("href").slice(1));
        if (!t) return;
        e.preventDefault();
        t.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        history.replaceState(null, "", a.getAttribute("href"));
      });
    });
  }

  // ---------- viewer ----------
  var lb = document.getElementById("lb");
  var thumbs = Array.prototype.slice.call(document.querySelectorAll("img.zoom"));
  if (!lb || !thumbs.length) return;

  var stage = lb.querySelector(".lb-stage");
  var img = lb.querySelector(".lb-img");
  var titleEl = lb.querySelector(".lb-title");
  var dl = lb.querySelector(".lb-dl");
  var fmtButtons = Array.prototype.slice.call(lb.querySelectorAll(".lb-fmts button"));
  var info = lb.querySelector(".lb-info");
  var dataEl = document.getElementById("ig-data");
  var igData = dataEl ? JSON.parse(dataEl.textContent) : { items: [] };
  var byN = {};
  igData.items.forEach(function (it) { byN[it.n] = it; });
  var index = -1;
  var fmt = "landscape";
  var busy = false;
  var lastFocus = null;

  function srcFor(i, f) {
    return thumbs[i].getAttribute("data-" + f);
  }

  function fill(i) {
    index = i;
    var src = srcFor(i, fmt);
    img.src = src;
    img.alt = thumbs[i].alt;
    titleEl.textContent = thumbs[i].getAttribute("data-title");
    dl.href = src;
    dl.setAttribute("download", src.split("?")[0].split("/").pop());
    fmtButtons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-f") === fmt));
    });
    lb.querySelector(".lb-prev").hidden = thumbs.length < 2;
    lb.querySelector(".lb-next").hidden = thumbs.length < 2;
  }

  // ---------- typewriter text beside the image ----------
  var typeJob = 0;
  var finishTyping = function () {};

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function writeInfo(i) {
    var it = byN[Number(thumbs[i].getAttribute("data-n"))];
    if (!it || !info) return;
    var job = ++typeJob;
    var q = function (sel) { return info.querySelector(sel); };
    var parts = [
      { el: q(".lb-kicker"), text: "Redbelly basics " + pad(it.n) + " / " + igData.total + ". Last verified " + igData.verified },
      { el: q(".lb-h"), text: it.title },
      { el: q(".lb-lead"), text: it.lead },
      { el: q(".lb-note"), text: it.note },
    ];
    var list = q(".lb-facts");
    list.innerHTML = "";
    it.facts.forEach(function (f) {
      var li = document.createElement("li");
      var claim = document.createElement("span");
      claim.className = "claim";
      var a = document.createElement("a");
      a.className = "lb-src";
      a.href = f.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = f.source;
      li.appendChild(claim);
      li.appendChild(a);
      list.appendChild(li);
      parts.push({ el: claim, text: f.claim, li: li });
    });
    parts.forEach(function (p) { p.el.textContent = ""; if (p.li) p.li.classList.remove("done"); });
    info.scrollTop = 0;
    q(".lb-fh").classList.remove("done");

    var done = function () {
      typeJob++; // stops the typing loop so it cannot overwrite the finished text
      parts.forEach(function (p) {
        p.el.textContent = p.text;
        p.el.classList.remove("typing");
        if (p.li) p.li.classList.add("done");
      });
      q(".lb-fh").classList.add("done");
      finishTyping = function () {};
    };
    finishTyping = function () { if (job === typeJob) done(); };
    if (reduceMotion) { done(); return; }

    var k = 0, pos = 0;
    var tick = function () {
      if (job !== typeJob) return;
      var p = parts[k];
      if (!p) { done(); return; }
      if (pos === 0) {
        p.el.classList.add("typing");
        if (p.li) q(".lb-fh").classList.add("done");
      }
      // The title types a little slower so it reads as it appears; facts type fastest.
      pos = Math.min(p.text.length, pos + (k === 1 ? 2 : k < 4 ? 4 : 6));
      p.el.textContent = p.text.slice(0, pos);
      if (pos >= p.text.length) {
        p.el.classList.remove("typing");
        if (p.li) p.li.classList.add("done");
        k++;
        pos = 0;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function ready(el) {
    if (el.complete && el.naturalWidth) return Promise.resolve();
    return new Promise(function (r) {
      el.onload = el.onerror = function () { r(); };
    });
  }

  // Transform that maps the big image onto the thumbnail's box.
  function transformTo(rect) {
    var big = img.getBoundingClientRect();
    if (!big.width || !rect.width) return null;
    var sx = rect.width / big.width;
    var sy = rect.height / big.height;
    var dx = rect.left + rect.width / 2 - (big.left + big.width / 2);
    var dy = rect.top + rect.height / 2 - (big.top + big.height / 2);
    return "translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ")";
  }

  function animate(el, from, to, done) {
    if (!DURATION) { done && done(); return; }
    var a = el.animate(
      [{ transform: from.t, opacity: from.o }, { transform: to.t, opacity: to.o }],
      { duration: DURATION, easing: EASE }
    );
    a.onfinish = function () { done && done(); };
  }

  function lockScroll(on) {
    var gap = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.overflow = on ? "hidden" : "";
    document.body.style.paddingRight = on && gap > 0 ? gap + "px" : "";
  }

  var session = 0; // bumps on every close, so work queued by an earlier open or step is dropped

  // The format a thumbnail is showing: phones get the 4:5 version from the picture element.
  function shownFmt(thumb) {
    return /\/portrait\//.test(thumb.currentSrc || "") ? "portrait" : thumb.getAttribute("data-fmt") || "landscape";
  }

  function open(i) {
    if (busy) return;
    busy = true;
    var mine = ++session;
    lastFocus = document.activeElement;
    fmt = shownFmt(thumbs[i]);
    fill(i);
    writeInfo(i);
    lockScroll(true);
    lb.hidden = false;
    lb.classList.remove("closing");
    requestAnimationFrame(function () { lb.classList.add("open"); });
    ready(img).then(function () {
      if (mine !== session) return;
      var from = transformTo(thumbs[i].getBoundingClientRect());
      // Only zoom from the thumbnail when its shape matches the format shown.
      animate(img, { t: from || "scale(0.92)", o: from ? 1 : 0 }, { t: "none", o: 1 }, function () { busy = false; });
      if (!DURATION) busy = false;
      lb.querySelector(".lb-close").focus({ preventScroll: true });
    });
  }

  function close() {
    if (lb.hidden || lb.classList.contains("closing")) return;
    // Closing always wins: stop any zoom or slide still running and close from where it is.
    session++;
    img.getAnimations().forEach(function (a) { a.cancel(); });
    busy = true;
    var thumb = thumbs[index];
    // Bring the card of the image being closed into view, so it lands back in its place.
    var r = thumb.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) {
      document.documentElement.style.overflow = "";
      thumb.scrollIntoView({ block: "center" });
      document.documentElement.style.overflow = "hidden";
    }
    var sameShape = shownFmt(thumb) === fmt;
    var to = sameShape ? transformTo(thumb.getBoundingClientRect()) : null;
    lb.classList.add("closing");
    lb.classList.remove("open");
    animate(img, { t: "none", o: 1 }, { t: to || "scale(0.92)", o: to ? 1 : 0 }, finish);
    if (!DURATION) finish();
    function finish() {
      typeJob++;
      lb.hidden = true;
      lb.classList.remove("closing");
      img.removeAttribute("src");
      lockScroll(false);
      busy = false;
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
  }

  function step(dir) {
    if (busy || thumbs.length < 2) return;
    busy = true;
    var mine = session;
    var next = (index + dir + thumbs.length) % thumbs.length;
    writeInfo(next); // start the new text at once, so a click on it can finish it
    var w = Math.min(window.innerWidth, 900) * 0.35;
    animate(img, { t: "none", o: 1 }, { t: "translateX(" + -dir * w + "px)", o: 0 }, function () {
      fill(next);
      if (mine !== session) return;
      ready(img).then(function () {
        if (mine !== session) return;
        animate(img, { t: "translateX(" + dir * w + "px)", o: 0 }, { t: "none", o: 1 }, function () { busy = false; });
        if (!DURATION) busy = false;
      });
    });
    if (!DURATION) { fill(next); busy = false; }
  }

  // On the gallery, a click anywhere on a card's text also opens its image.
  thumbs.forEach(function (t, i) {
    var card = t.closest(".card");
    var body = card && card.querySelector(".body");
    if (!body) return;
    body.classList.add("opens");
    body.addEventListener("click", function (e) {
      if (e.target.closest("a, button")) return; // the PNG and Sources buttons keep their own job
      open(i);
    });
  });

  thumbs.forEach(function (t, i) {
    t.parentElement.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let new-tab clicks through
      e.preventDefault();
      open(i);
    });
  });

  // A click on any empty space around the image and the text closes the viewer.
  // A click on the text finishes the typing at once.
  lb.addEventListener("click", function (e) {
    if (e.target === lb || e.target === stage) close();
  });
  if (info) info.addEventListener("click", function (e) {
    if (e.target.tagName !== "A") finishTyping();
  });
  lb.querySelector(".lb-close").addEventListener("click", close);
  lb.querySelector(".lb-prev").addEventListener("click", function () { step(-1); });
  lb.querySelector(".lb-next").addEventListener("click", function () { step(1); });
  fmtButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      fmt = b.getAttribute("data-f");
      fill(index);
    });
  });

  document.addEventListener("keydown", function (e) {
    if (lb.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "Tab") {
      // Keep focus inside the viewer.
      var f = Array.prototype.slice.call(lb.querySelectorAll("button:not([hidden]), a[href]"));
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Swipe: left or right moves between infographics, down closes.
  var sx = 0, sy = 0, dx = 0, dy = 0, touching = false;
  stage.addEventListener("touchstart", function (e) {
    if (busy || e.touches.length !== 1) return;
    touching = true;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = dy = 0;
    img.style.transition = "none";
  }, { passive: true });
  stage.addEventListener("touchmove", function (e) {
    if (!touching) return;
    dx = e.touches[0].clientX - sx;
    dy = e.touches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy)) img.style.transform = "translateX(" + dx + "px)";
    else if (dy > 0) img.style.transform = "translateY(" + dy + "px)";
  }, { passive: true });
  stage.addEventListener("touchend", function () {
    if (!touching) return;
    touching = false;
    img.style.transform = "";
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
    else if (dy > 90 && dy > Math.abs(dx)) close();
  });
})();
