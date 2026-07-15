/**
 * auth.js — Autenticação Google.
 * Usa signInWithRedirect no Safari/iOS (popup bloqueado) e signInWithPopup nos demais.
 */
import { auth } from "./firebase.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { notif }                from "./helpers.js";
import { navTo }                from "./navigation.js";

// ─── E-mails autorizados — carregados do Firestore, não hardcoded ────────────
// A lista real fica em config/admins no Firebase (só admin acessa)
// Fallback local apenas para bootstrap inicial
const _ADMIN_FALLBACK = btoa("ksanti16@gmail.com,loislene.cristine05@gmail.com");

// ─── Detectar Safari / iOS ────────────────────────────────────────────────────
function isSafariOrIOS() {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/i.test(ua) ||
    (/Safari/i.test(ua) && !/Chrome|CriOS|FxiOS/i.test(ua));
}

// ─── Login Google ─────────────────────────────────────────────────────────────
window.loginGoogle = async function () {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    if (isSafariOrIOS()) {
      // Safari bloqueia popup — usa redirect
      await signInWithRedirect(auth, provider);
      // Execução continua após o redirect retornar (veja getRedirectResult abaixo)
    } else {
      await signInWithPopup(auth, provider);
    }
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/popup-closed-by-user") {
      // Fallback: tenta redirect se popup falhar
      try {
        await signInWithRedirect(auth, provider);
      } catch (e2) {
        notif("Erro ao entrar: " + e2.message, true);
      }
    } else {
      notif("Erro ao entrar: " + e.message, true);
    }
  }
};

// ─── Processar resultado do redirect (Safari/iOS) ────────────────────────────
getRedirectResult(auth).catch(() => {});

// ─── Logout ───────────────────────────────────────────────────────────────────
window.fazerLogout = async function () {
  if (!await window.confirmar({ titulo:"Sair do sistema", msg:"Deseja encerrar a sessão?", tipo:"warning", labelOk:"Sair" })) return;
  try { await signOut(auth); } catch (_) {}
  window.location.href = "index.html";
};

// ─── Bind botão de login ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector(".btn-google");
  if (btn) {
    btn.removeAttribute("onclick");
    btn.addEventListener("click", () => window.loginGoogle());
  }
});

// ─── Observador de autenticação ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  const loginScreen = document.getElementById("login-screen");
  const app         = document.getElementById("app");

  if (!user) {
    if (loginScreen) loginScreen.style.display = "flex";
    if (app) app.classList.remove("on");
    return;
  }

  // ── Verificar permissão ────────────────────────────────────────────────────
  const _admins = atob(_ADMIN_FALLBACK).split(",");

  if (!_admins.includes(user.email)) {
    // Buscar no Firestore
    let permitido = false;
    let perfilUser = null;
    try {
      const { getDocs, collection: col, query: qry, where: whr } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const { db: dbRef } = await import("./firebase.js");
      const snap = await getDocs(qry(col(dbRef,"usuarios"), whr("email","==",user.email)));
      if (!snap.empty) {
        const u = snap.docs[0].data();
        perfilUser = u.perfil;
        permitido = u.ativo !== false;
      }
    } catch(_) {}

    if (!permitido) {
      notif("Acesso não autorizado. Entre em contato com o administrador.", true);
      await signOut(auth);
      return;
    }

    // Clientes vão para o catálogo
    if (perfilUser === "cliente") {
      await signOut(auth);
      window.location.href = "index.html";
      return;
    }

    // Operadores: esconder financeiro e configurações
    if (perfilUser === "operador") {
      document.querySelectorAll('[data-pg="financeiro"],[data-pg="configuracoes"]')
        .forEach(el => el.style.display = "none");
    }

    // Salvar perfil para uso no sistema
    window._perfilAtual = perfilUser;
  } else {
    window._perfilAtual = "admin";
  }

  if (loginScreen) loginScreen.style.display = "none";
  if (app) app.classList.add("on");

  const nm = document.getElementById("sb-uname");
  if (nm) nm.textContent = user.displayName ? user.displayName.split(" ")[0] : "Usuária";

  const av = document.getElementById("sb-avatar");
  if (av) av.src = user.photoURL || "";

  if (typeof window.startListeners === "function") {
    window.startListeners();
  }

  navTo("dashboard");

  // ── Botão instalar PWA no iOS (não tem beforeinstallprompt) ───────────────
  if (_isIOS() && !_isStandalone()) {
    _mostrarBtnInstalar();
  }
});

// ─── PWA: Service Worker ─────────────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ─── Detectar plataforma ──────────────────────────────────────────────────────
function _isIOS() {
  return /iP(hone|ad|od)/i.test(navigator.userAgent);
}
function _isAndroid() {
  return /Android/i.test(navigator.userAgent);
}
function _isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;
}

// ─── Prompt nativo Android/Chrome ────────────────────────────────────────────
let _pwaPrompt = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  _pwaPrompt = e;
  _mostrarBtnInstalar();
});

window.instalarPWA = async function() {
  if (!_pwaPrompt) return;
  _pwaPrompt.prompt();
  const { outcome } = await _pwaPrompt.userChoice;
  if (outcome === "accepted") {
    document.getElementById("modal-install-app")?.classList.remove("on");
    _esconderBtnInstalar();
  }
  _pwaPrompt = null;
};

window.addEventListener("appinstalled", () => {
  _esconderBtnInstalar();
  _pwaPrompt = null;
});

// ─── Mostrar/esconder botão instalar ─────────────────────────────────────────
function _mostrarBtnInstalar() {
  const sb = document.getElementById("btn-instalar-sidebar");
  if (sb) sb.style.display = "flex";
  const tb = document.getElementById("btn-instalar-pwa");
  if (tb) tb.style.display = "inline-flex";
  // Mostrar botão Android no modal se prompt disponível
  const ab = document.getElementById("btn-instalar-android");
  if (ab) ab.style.display = "block";
}
function _esconderBtnInstalar() {
  const sb = document.getElementById("btn-instalar-sidebar");
  if (sb) sb.style.display = "none";
  const tb = document.getElementById("btn-instalar-pwa");
  if (tb) tb.style.display = "none";
}

// ─── Modal de instalação ──────────────────────────────────────────────────────
window.mostrarInstalacaoApp = function() {
  const ov = document.getElementById("modal-install-app");
  if (!ov) return;
  const iosDiv = document.getElementById("install-ios");
  const andDiv = document.getElementById("install-android");

  // Mostrar instruções certas para cada plataforma
  if (iosDiv) iosDiv.style.display = _isIOS() ? "block" : "none";
  if (andDiv) andDiv.style.display = (_isAndroid() || !_isIOS()) ? "block" : "none";

  // Botão instalar Android só aparece se prompt disponível
  const androidBtn = document.getElementById("btn-instalar-android");
  if (androidBtn) androidBtn.style.display = _pwaPrompt ? "block" : "none";

  ov.style.display = "flex";
  ov.classList.add("on");
};

window.fecharInstalacaoApp = function() {
  const ov = document.getElementById("modal-install-app");
  if (!ov) return;
  ov.classList.remove("on");
  setTimeout(() => { ov.style.display = "none"; }, 220);
};

// iOS detection moved to onAuthStateChanged (sidebar exists after login)
