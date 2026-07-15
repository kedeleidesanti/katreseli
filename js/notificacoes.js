/**
 * notificacoes.js — Alertas de devoluções próximas, pagamentos e notificações
 */
import { locacoes, clientes } from "./state.js";
import { fmtD, fmtR, el }     from "./helpers.js";
import { db, collection, query, where, onSnapshot, updateDoc, doc } from "./firebase.js";

// ─── Listener de pagamentos confirmados ──────────────────────────────────────
let _pagNotifUnsub = null;

export function escutarPagamentosConfirmados() {
  if (_pagNotifUnsub) return;
  try {
    const q = query(
      collection(db, "notificacoes"),
      where("tipo", "in", ["pagamento_confirmado", "pagamento_aguardando"]),
      where("lida", "==", false)
    );
    _pagNotifUnsub = onSnapshot(q, snap => {
      window._pagamentosConfirmados = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      _atualizarBadgePag(snap.docs.length);
      if (snap.docs.length > 0) {
        _mostrarToastPagamento(snap.docs[0].data());
      }
    });
  } catch(e) {
    console.warn("Erro ao escutar pagamentos:", e);
  }
}

function _atualizarBadgePag(total) {
  const badge = el("notif-badge");
  if (!badge) return;
  badge.dataset.pags = total;
  const devs = parseInt(badge.dataset.devs || "0");
  const tot  = devs + total;
  badge.textContent = tot || "";
  if (tot > 0) badge.classList.add("show"); else badge.classList.remove("show");
}

function _mostrarToastPagamento(data) {
  if (el("toast-pag-adm")) return;
  const isPending = data.tipo === "pagamento_aguardando";
  const toast = document.createElement("div");
  toast.id = "toast-pag-adm";
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:${isPending?"#1d4ed8":"#15803d"};color:#fff;padding:14px 18px;border-radius:14px;font-size:13px;font-weight:600;z-index:99999;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,.2);max-width:320px;cursor:pointer`;
  toast.innerHTML = `
    <i class="ti ${isPending?"ti-clock":"ti-circle-check"}" style="font-size:22px;flex-shrink:0"></i>
    <div>
      <div style="font-weight:700;margin-bottom:2px">${isPending?"⏳ Pagamento aguardando!":"💰 Pagamento confirmado!"}</div>
      <div style="font-size:11px;opacity:.9">${data.msg || "Novo pagamento"}</div>
    </div>
    <button onclick="document.getElementById('toast-pag-adm')?.remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:4px">×</button>`;
  toast.addEventListener("click", e => {
    if (e.target.tagName !== "BUTTON") {
      window.mudarAba?.("pagamentos");
      setTimeout(() => window.mudarAbaPag?.(isPending ? "comprovantes" : "transacoes"), 100);
      toast.remove();
    }
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}

export async function marcarPagsLidos() {
  try {
    const pags = window._pagamentosConfirmados || [];
    for (const p of pags) {
      if (p.id) await updateDoc(doc(db, "notificacoes", p.id), { lida: true }).catch(() => {});
    }
    window._pagamentosConfirmados = [];
    _atualizarBadgePag(0);
  } catch(e) {}
}
window.marcarPagsLidos = marcarPagsLidos;

// ─── Verificar devoluções e montar badge ─────────────────────────────────────
export function verificarNotificacoes() {
  const hoje = new Date().toISOString().split("T")[0];
  const lns  = locacoes.filter(l => l.status === "ativo" && l.devolucao);

  const urgentes = lns.filter(l => {
    const dias = Math.round((new Date(l.devolucao) - new Date(hoje)) / (1000*60*60*24));
    return dias <= 2 && dias >= 0;
  });

  const badge = el("notif-badge");
  if (badge) {
    badge.dataset.devs = urgentes.length;
    const pags = parseInt(badge.dataset.pags || "0");
    const tot  = urgentes.length + pags;
    badge.textContent = tot || "";
    if (tot > 0) badge.classList.add("show"); else badge.classList.remove("show");
  }

  return urgentes;
}

// ─── Renderizar painel de notificações ───────────────────────────────────────
export function renderPainelNotif() {
  const hoje = new Date().toISOString().split("T")[0];
  const div  = el("painel-notif-lista"); if (!div) return;

  const lns = locacoes.filter(l => l.status === "ativo" && l.devolucao);
  const com = (l) => Math.round((new Date(l.devolucao) - new Date(hoje)) / (1000*60*60*24));

  const hoje_  = lns.filter(l => com(l) === 0);
  const amanha = lns.filter(l => com(l) === 1);
  const em2d   = lns.filter(l => com(l) === 2);
  const sem    = lns.filter(l => { const d = com(l); return d > 2 && d <= 7; });

  const mkCard = (l, cor, emoji, label) => {
    const c = clientes.find(x => x.id === l.clienteId) || {};
    return `<div class="notif-card notif-${cor}">
      <div class="notif-card-top">
        <span class="notif-emoji">${emoji}</span>
        <div class="notif-card-info">
          <strong>${c.nome || "—"}</strong>
          <span>${l.evento || "Sem evento"} &bull; Devolução: ${fmtD(l.devolucao)}</span>
        </div>
        <span class="notif-label">${label}</span>
      </div>
      ${(l.saldo || 0) > 0 ? `<div class="notif-saldo">💰 Saldo pendente: <strong>${fmtR(l.saldo)}</strong></div>` : ""}
      <div class="notif-acts">
        <button class="btn btn-s btn-xs" onclick="whatsLembrete('${l.id}')"><svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.133 1.527 5.887L.057 23.996l6.304-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.981.999-3.648-.235-.374A9.856 9.856 0 012.118 12C2.118 6.533 6.533 2.118 12 2.118S21.882 6.533 21.882 12 17.467 21.882 12 21.882z"/></svg> Lembrar</button>
        <button class="btn btn-s btn-xs" onclick="devolverLoc('${l.id}')"><i class="ti ti-check"></i> Devolvido</button>
      </div>
    </div>`;
  };

  // Pagamentos confirmados no topo
  let html = "";
  const pags = window._pagamentosConfirmados || [];
  if (pags.length) {
    html += `<div class="notif-sec">💰 Pagamentos confirmados</div>` +
      pags.map(p => `
        <div class="notif-card notif-green" style="cursor:pointer" onclick="window.mudarAba?.('financeiro');marcarPagsLidos()">
          <div class="notif-card-top">
            <span class="notif-emoji">💰</span>
            <div class="notif-card-info">
              <strong>${(p.msg || "Pagamento confirmado").replace("💰 ","")}</strong>
              <span>${p.criadoEm?.toDate?.()?.toLocaleString("pt-BR") || "Agora"}</span>
            </div>
            <span class="notif-label" style="background:#dcfce7;color:#15803d">PAGO</span>
          </div>
        </div>`).join("");
  }

  if (hoje_.length)  html += `<div class="notif-sec">🔴 Devolução hoje</div>`  + hoje_.map(l  => mkCard(l, "red",    "🔴", "HOJE")).join("");
  if (amanha.length) html += `<div class="notif-sec">🟡 Amanhã</div>`         + amanha.map(l => mkCard(l, "yellow", "🟡", "Amanhã")).join("");
  if (em2d.length)   html += `<div class="notif-sec">🟠 Em 2 dias</div>`      + em2d.map(l   => mkCard(l, "orange", "🟠", "2 dias")).join("");
  if (sem.length)    html += `<div class="notif-sec">📅 Esta semana</div>`     + sem.map(l    => mkCard(l, "blue",   "📅", fmtD(l.devolucao))).join("");

  if (!html) html = `<div style="padding:28px;text-align:center;color:var(--txt3)">
    <i class="ti ti-check" style="font-size:32px;display:block;margin-bottom:8px;opacity:.3"></i>
    Nenhuma notificação pendente!
  </div>`;

  div.innerHTML = html;
}
window.renderPainelNotif = renderPainelNotif;

// ─── Toggle painel ────────────────────────────────────────────────────────────
window.togglePainelNotif = function() {
  const painel = el("painel-notif");
  if (!painel) return;
  const aberto = painel.classList.toggle("aberto");
  if (aberto) {
    renderPainelNotif();
    marcarPagsLidos();
    setTimeout(() => {
      document.addEventListener("click", function fechar(e) {
        if (!painel.contains(e.target) && !e.target.closest("#btn-notif")) {
          painel.classList.remove("aberto");
          document.removeEventListener("click", fechar);
        }
      });
    }, 50);
  }
};
