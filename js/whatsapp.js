/**
 * whatsapp.js — Envio de mensagens via WhatsApp
 */
import { clientes, locacoes, cfg } from "./state.js";
import { fmtR, fmtD, notif }       from "./helpers.js";

// ─── Helper interno ───────────────────────────────────────────────────────────
function abrirWhatsApp(tel, msg) {
  const nums = (tel || "").replace(/\D/g, "");
  if (!nums) { notif("Cliente sem telefone cadastrado!", true); return; }
  const cc  = nums.startsWith("55") ? nums : "55" + nums;
  const isMob = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const url = isMob
    ? `whatsapp://send?phone=${cc}&text=${encodeURIComponent(msg)}`
    : `https://wa.me/${cc}?text=${encodeURIComponent(msg)}`;
  window.open(url, "_blank");
}

// ─── Montadores de mensagem ───────────────────────────────────────────────────
function montarMsgOrcamento(loc) {
  const c   = clientes.find(x => x.id === loc.clienteId) || {};
  const num = String(loc.id || "").slice(-6).toUpperCase();
  const itensLista = (loc.itens || [])
    .filter(x => x.tipo !== "kit")
    .map(it => `  • ${it.nome} × ${it.qtd} — ${fmtR((it.preco || 0) * it.qtd)}`)
    .join("\n");

  return `🎀 *${cfg.nome || "Katreseli"} — Orçamento #${num}*\n\nOlá, *${c.nome ? c.nome.split(" ")[0] : ""}*! Segue o orçamento solicitado:\n\n📅 *Período:* ${fmtD(loc.retirada)} a ${fmtD(loc.devolucao)}\n🎉 *Evento:* ${loc.evento || "—"}\n📍 *Local:* ${loc.local || "—"}\n\n*Itens inclusos:*\n${itensLista || "  (sem itens)"}\n\n${loc.desconto > 0 ? `🏷️ *Desconto:* − ${fmtR(loc.desconto)}\n` : ""}💰 *Valor total:* *${fmtR(loc.total)}*\n💳 *Entrada (50%):* ${fmtR(loc.entrada || 0)}\n📌 *Saldo na entrega:* ${fmtR(loc.saldo || 0)}\n${loc.pagamento ? `💳 *Forma de pagamento:* ${loc.pagamento}` : ""}\n\nPara confirmar sua reserva, efetue o pagamento da entrada.\n\n_${cfg.nome || "Katreseli"} — ${cfg.slogan || "Locações de Decoração Infantil"}_`;
}

function montarMsgConfirmacao(loc) {
  const c   = clientes.find(x => x.id === loc.clienteId) || {};
  const num = String(loc.id || "").slice(-6).toUpperCase();

  return `✅ *${cfg.nome || "Katreseli"} — Locação Confirmada #${num}*\n\nOlá, *${c.nome ? c.nome.split(" ")[0] : ""}*! Sua locação está confirmada! 🎉\n\n📅 *Retirada:* ${fmtD(loc.retirada)}\n📅 *Devolução:* ${fmtD(loc.devolucao)} até as 18h\n🎉 *Evento:* ${loc.evento || "—"}\n\n💰 *Total:* ${fmtR(loc.total)}\n✅ *Entrada paga:* ${fmtR(loc.entrada || 0)}\n${(loc.saldo || 0) > 0 ? `📌 *Saldo na entrega:* ${fmtR(loc.saldo)}` : "✅ *Locação quitada!*"}\n\nQualquer dúvida, estamos à disposição!\n_${cfg.nome || "Katreseli"}_`;
}

function montarMsgLembrete(loc) {
  const c   = clientes.find(x => x.id === loc.clienteId) || {};
  const hoje = new Date().toISOString().split("T")[0];
  const dias = Math.round((new Date(loc.devolucao) - new Date(hoje)) / (1000*60*60*24));

  return `⏰ *Lembrete — ${cfg.nome || "Katreseli"}*\n\nOlá, *${c.nome ? c.nome.split(" ")[0] : ""}*!\n\n${dias === 0 ? "🔴 A devolução dos itens é *hoje*!" : dias === 1 ? "🟡 A devolução dos itens é *amanhã*!" : `📅 A devolução dos itens é em *${dias} dias* (${fmtD(loc.devolucao)}).`}\n\nPor favor, lembre-se de devolver os itens *até as 18h* de ${fmtD(loc.devolucao)}.\n\n${(loc.saldo || 0) > 0 ? `💰 *Saldo pendente:* ${fmtR(loc.saldo)}\n` : ""}Obrigada pela preferência! 🎀\n_${cfg.nome || "Katreseli"}_`;
}

// ─── API pública ──────────────────────────────────────────────────────────────
window.whatsOrcamento = function(locId) {
  const loc = locacoes.find(x => x.id === locId);
  if (!loc) { notif("Locação não encontrada", true); return; }
  const c = clientes.find(x => x.id === loc.clienteId) || {};
  abrirWhatsApp(c.tel, montarMsgOrcamento(loc));
};

window.whatsConfirmacao = function(locId) {
  const loc = locacoes.find(x => x.id === locId);
  if (!loc) { notif("Locação não encontrada", true); return; }
  const c = clientes.find(x => x.id === loc.clienteId) || {};
  abrirWhatsApp(c.tel, montarMsgConfirmacao(loc));
};

window.whatsLembrete = function(locId) {
  const loc = locacoes.find(x => x.id === locId);
  if (!loc) { notif("Locação não encontrada", true); return; }
  const c = clientes.find(x => x.id === loc.clienteId) || {};
  abrirWhatsApp(c.tel, montarMsgLembrete(loc));
};

// ─── Menu dropdown de WhatsApp na tabela ─────────────────────────────────────
window.menuWhats = function(locId, btn) {
  document.querySelectorAll(".whats-menu").forEach(m => m.remove());

  const loc = locacoes.find(x => x.id === locId); if (!loc) return;
  const menu = document.createElement("div");
  menu.className = "whats-menu";
  menu.innerHTML = `
    <button onclick="whatsOrcamento('${locId}');this.closest('.whats-menu').remove()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg> Enviar orçamento
    </button>
    <button onclick="whatsConfirmacao('${locId}');this.closest('.whats-menu').remove()">
      <i class="ti ti-check"></i> Confirmação de locação
    </button>
    <button onclick="whatsLembrete('${locId}');this.closest('.whats-menu').remove()">
      <i class="ti ti-bell"></i> Lembrete de devolução
    </button>`;

  const rect = btn.getBoundingClientRect();
  menu.style.cssText = `position:fixed;top:${rect.bottom+6}px;left:${rect.left}px;z-index:9999`;
  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener("click", function close(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("click", close); }
    });
  }, 50);
};

// ─── Avaliação pós-evento ─────────────────────────────────────────────────────
window.enviarAvaliacaoPosEvento = function(locId) {
  const loc = locacoes.find(x => x.id === locId);
  if (!loc) { notif("Locação não encontrada", true); return; }
  const c = clientes.find(x => x.id === loc.clienteId) || {};
  if (!c.tel) { notif("Cliente sem telefone", true); return; }
  const msg = `Olá ${c.nome?.split(" ")[0] || ""}! 🎀\n\nFoi um prazer decorar o evento "${loc.evento || "seu evento"}"!\n\nGostaríamos de saber sua opinião. Pode nos dar uma avaliação de 1 a 5 estrelas?\n\n⭐ 1 - Ruim\n⭐⭐ 2 - Regular\n⭐⭐⭐ 3 - Bom\n⭐⭐⭐⭐ 4 - Ótimo\n⭐⭐⭐⭐⭐ 5 - Excelente\n\nObrigada! — ${cfg.nome || "Katreseli"}`;
  abrirWhatsApp(c.tel, msg);
};

// ─── Lembrete de devolução ────────────────────────────────────────────────────
window.enviarLembreteDevolucao = function(locId) {
  const loc = locacoes.find(x => x.id === locId);
  if (!loc) { notif("Locação não encontrada", true); return; }
  const c = clientes.find(x => x.id === loc.clienteId) || {};
  if (!c.tel) { notif("Cliente sem telefone", true); return; }
  const dataFormatada = loc.devolucao
    ? new Date(loc.devolucao + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
    : "data combinada";
  const msg = `Olá ${c.nome?.split(" ")[0] || ""}! 🎀\n\nLembrete: a devolução dos itens do evento *"${loc.evento || "seu evento"}"* é *${dataFormatada}* até as 18h.\n\nQualquer dúvida, é só chamar! — ${cfg.nome || "Katreseli"}`;
  abrirWhatsApp(c.tel, msg);
  notif("Lembrete enviado!");
};

// ─── Rota de entregas do dia ──────────────────────────────────────────────────
window.abrirRotaEntregas = function() {
  const hoje = new Date().toISOString().split("T")[0];
  const entregas = locacoes.filter(l => l.status === "ativo" && l.retirada === hoje && l.entregaEnd);
  if (!entregas.length) { notif("Nenhuma entrega hoje com endereço cadastrado.", true); return; }
  const enderecos = entregas.map(l => encodeURIComponent(l.entregaEnd)).join("/");
  window.open(`https://www.google.com/maps/dir/${enderecos}`, "_blank");
};
