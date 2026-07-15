/**
 * link-confirmacao.js — Link de confirmação de reserva para o cliente
 * (Opcional — ativado nas configurações)
 */
import { db, doc, getDoc, updateDoc } from "./firebase.js";
import { locacoes, clientes, cfg }     from "./state.js";
import { fmtR, fmtD, notif }           from "./helpers.js";

// ─── Gerar link de confirmação ────────────────────────────────────────────────
window.gerarLinkConfirmacao = function(locId) {
  if (!cfg.linkConfirmacao) {
    notif("Ative o link de confirmação nas Configurações!", true);
    return;
  }
  const loc = locacoes.find(x => x.id === locId); if (!loc) return;
  const c   = clientes.find(x => x.id === loc.clienteId) || {};
  const num = String(locId).slice(-6).toUpperCase();
  const cor = cfg.cor || "#d4307a";

  // Gerar HTML da página de confirmação (standalone)
  const itensHtml = (loc.itens || []).filter(x => x.tipo !== "kit")
    .map(it => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0edf4;font-size:13px"><span>${it.nome} ×${it.qtd}</span><span style="font-weight:600;color:${cor}">${fmtR((it.preco||0)*it.qtd)}</span></div>`)
    .join("");

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Confirmar Reserva — ${cfg.nome||"Katreseli"}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",sans-serif;background:#f5f0f4;color:#1a0a14;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;border-radius:20px;width:100%;max-width:420px;overflow:hidden;box-shadow:0 8px 40px #0003}
.hd{background:${cor};color:#fff;padding:24px;text-align:center}
.hd-logo{font-size:20px;font-weight:800;margin-bottom:4px}
.hd-sub{font-size:12px;opacity:.8}
.bd{padding:22px}
.sec{font-size:10px;font-weight:700;color:${cor};text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px}
.row{display:flex;justify-content:space-between;font-size:13px;padding:5px 0}
.row-lbl{color:#888}
.row-val{font-weight:600}
.total-box{background:${cor}12;border:2px solid ${cor}40;border-radius:12px;padding:14px;text-align:center;margin:16px 0}
.total-val{font-size:26px;font-weight:800;color:${cor}}
.btn-conf{width:100%;padding:16px;background:${cor};color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:8px;transition:opacity .15s}
.btn-conf:hover{opacity:.88}
.btn-conf:disabled{opacity:.5;cursor:not-allowed}
.ok-box{text-align:center;padding:32px 20px;display:none}
.ok-ico{font-size:56px;margin-bottom:12px}
.ok-title{font-size:20px;font-weight:800;color:#15803d;margin-bottom:6px}
.ok-sub{font-size:13px;color:#888}
</style></head><body>
<div class="card" id="main-card">
  <div class="hd">
    <div style="font-size:32px;margin-bottom:8px">🎀</div>
    <div class="hd-logo">${cfg.nome||"Katreseli"}</div>
    <div class="hd-sub">Confirmar sua reserva</div>
  </div>
  <div class="bd">
    <div class="sec">Olá, ${c.nome ? c.nome.split(" ")[0] : "cliente"}!</div>
    <p style="font-size:13px;color:#666;line-height:1.6">Sua reserva está quase confirmada. Confira os detalhes abaixo e clique em confirmar para garantir sua locação.</p>

    <div class="sec">Evento</div>
    <div class="row"><span class="row-lbl">Tipo</span><span class="row-val">${loc.evento||"—"}</span></div>
    <div class="row"><span class="row-lbl">Local</span><span class="row-val">${loc.local||"—"}</span></div>
    <div class="row"><span class="row-lbl">Retirada</span><span class="row-val" style="color:${cor};font-weight:700">${fmtD(loc.retirada)}</span></div>
    <div class="row"><span class="row-lbl">Devolução</span><span class="row-val" style="color:#2563eb;font-weight:700">${fmtD(loc.devolucao)}</span></div>

    <div class="sec">Itens inclusos</div>
    ${itensHtml || "<p style='font-size:12px;color:#aaa'>Nenhum item</p>"}

    <div class="total-box">
      <div style="font-size:11px;color:${cor};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Valor total</div>
      <div class="total-val">${fmtR(loc.total)}</div>
      <div style="font-size:12px;color:#888;margin-top:4px">Entrada: ${fmtR(loc.entrada||0)} · Saldo na entrega: ${fmtR(loc.saldo||0)}</div>
    </div>

    <button class="btn-conf" id="btn-conf" onclick="confirmar()">✓ Confirmar minha reserva</button>
    <p style="font-size:11px;color:#aaa;text-align:center;margin-top:10px">Ao confirmar, você concorda com os termos da locação.</p>
  </div>
</div>

<div class="ok-box" id="ok-box">
  <div class="ok-ico">🎉</div>
  <div class="ok-title">Reserva confirmada!</div>
  <div class="ok-sub">Sua locação foi confirmada.<br>${cfg.nome||"Katreseli"} entrará em contato em breve.</div>
</div>

<script>
const LOC_ID = "${locId}";
const FB_URL = "https://firestore.googleapis.com/v1/projects/katreseli/databases/(default)/documents/locacoes/" + LOC_ID;
const FB_KEY = "${(cfg.firebaseKey||"")}";

async function confirmar() {
  const btn = document.getElementById("btn-conf");
  btn.disabled = true;
  btn.textContent = "Confirmando...";
  try {
    // Patch via REST API do Firestore
    const res = await fetch(FB_URL + "?updateMask.fieldPaths=status&updateMask.fieldPaths=confirmadoOnline&key=${(cfg.firebaseKey||"")}",
      { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { status: { stringValue: "ativo" }, confirmadoOnline: { booleanValue: true } } })
      });
    if (res.ok) {
      document.getElementById("main-card").style.display = "none";
      document.getElementById("ok-box").style.display = "block";
    } else {
      btn.disabled = false;
      btn.textContent = "✓ Confirmar minha reserva";
      alert("Erro ao confirmar. Tente novamente ou entre em contato.");
    }
  } catch(e) {
    btn.disabled = false;
    btn.textContent = "✓ Confirmar minha reserva";
  }
}
</script>
</body></html>`;

  // Abrir em nova aba (cliente pode acessar / salvar o arquivo)
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);

  // Montar mensagem WhatsApp com o link
  const tel = (c.tel || "").replace(/\D/g, "");
  const msg = `🎀 *${cfg.nome||"Katreseli"} — Confirmar Reserva #${num}*\n\nOlá, *${c.nome ? c.nome.split(" ")[0] : ""}*! Sua reserva está pronta para confirmar!\n\n🎉 *Evento:* ${loc.evento||"—"}\n📅 *Retirada:* ${fmtD(loc.retirada)}\n📅 *Devolução:* ${fmtD(loc.devolucao)}\n💰 *Total:* ${fmtR(loc.total)}\n\n👆 Acesse o link abaixo para confirmar sua reserva:\n${url}\n\n_${cfg.nome||"Katreseli"}_`;

  if (tel) {
    const cc = tel.startsWith("55") ? tel : "55" + tel;
    window.open(`https://wa.me/${cc}?text=${encodeURIComponent(msg)}`, "_blank");
  } else {
    window.open(url, "_blank");
    notif("Cliente sem telefone — abrindo a página de confirmação.");
  }
  URL.revokeObjectURL(url);
};

// ─── Atualizar config com o toggle ───────────────────────────────────────────
export function sincLinkConfiguracoes() {
  const chk = document.getElementById("cfg-link-confirmacao");
  if (chk) chk.checked = !!cfg.linkConfirmacao;
}
window.sincLinkConfiguracoes = sincLinkConfiguracoes;
