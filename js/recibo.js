/**
 * recibo.js — Gerador de recibo de pagamento em PDF
 */
import { clientes, locacoes, cfg } from "./state.js";
import { db, doc, updateDoc } from "./firebase.js";
import { fmtR, fmtD, notif }       from "./helpers.js";

export function gerarRecibo(locId, valorPago, forma, tipo = "entrada") {
  const loc = locacoes.find(x => x.id === locId); if (!loc) return;
  const c   = clientes.find(x => x.id === loc.clienteId) || {};
  const num = String(locId).slice(-6).toUpperCase();
  const cor = cfg.cor || "#d4307a";
  const hoje = new Date().toLocaleDateString("pt-BR");
  const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const tipoLabel = tipo === "entrada" ? "Entrada / Sinal" : "Saldo / Quitação";

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Recibo #${num}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;color:#1a0a14;background:#fff}
@media print{@page{size:80mm 160mm;margin:0}body{padding:6mm}}
.wrap{max-width:340px;margin:0 auto;padding:20px}
.logo{text-align:center;margin-bottom:12px}
.logo-nome{font-size:18px;font-weight:800;color:${cor}}
.logo-sub{font-size:10px;color:#aaa}
.divider{border-top:1.5px dashed #ddd;margin:12px 0}
.titulo{text-align:center;font-size:13px;font-weight:700;color:${cor};text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
.row{display:flex;justify-content:space-between;font-size:11px;margin-bottom:6px}
.row-lbl{color:#888}
.row-val{font-weight:600;color:#1a0a14;text-align:right;max-width:60%}
.valor-box{background:${cor}15;border:2px solid ${cor};border-radius:12px;padding:14px;text-align:center;margin:14px 0}
.valor-lbl{font-size:10px;color:${cor};text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px}
.valor-num{font-size:26px;font-weight:800;color:${cor}}
.forma{text-align:center;font-size:12px;color:#555;margin-top:4px}
.rodape{text-align:center;font-size:10px;color:#aaa;margin-top:16px;line-height:1.6}
.num{text-align:center;font-size:10px;color:#bbb;margin-bottom:12px}
</style></head><body>
<div class="wrap">
  <div class="logo">
    ${cfg.logo ? `<img src="${cfg.logo}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;margin-bottom:6px">` : `<div style="font-size:28px;margin-bottom:4px">🎀</div>`}
    <div class="logo-nome">${cfg.nome || "Katreseli"}</div>
    <div class="logo-sub">${cfg.slogan || "Locações de Decoração Infantil"}</div>
  </div>
  <div class="divider"></div>
  <div class="titulo">Recibo de Pagamento</div>
  <div class="num">Ref. Contrato #${num} &bull; ${hoje} às ${hora}</div>

  <div class="row"><span class="row-lbl">LOCATÁRIO(A)</span><span class="row-val">${c.nome || "—"}</span></div>
  <div class="row"><span class="row-lbl">CPF</span><span class="row-val">${c.cpf || "—"}</span></div>
  <div class="row"><span class="row-lbl">Evento</span><span class="row-val">${loc.evento || "—"}</span></div>
  <div class="row"><span class="row-lbl">Retirada</span><span class="row-val">${fmtD(loc.retirada)}</span></div>
  <div class="row"><span class="row-lbl">Devolução</span><span class="row-val">${fmtD(loc.devolucao)}</span></div>

  <div class="divider"></div>

  <div class="row"><span class="row-lbl">Valor total do contrato</span><span class="row-val">${fmtR(loc.total)}</span></div>
  <div class="row"><span class="row-lbl">Tipo de pagamento</span><span class="row-val">${tipoLabel}</span></div>

  <div class="valor-box">
    <div class="valor-lbl">Valor recebido</div>
    <div class="valor-num">${fmtR(valorPago)}</div>
    <div class="forma">${forma}</div>
  </div>

  ${(loc.saldo || 0) > 0 && tipo !== "quitacao"
    ? `<div class="row"><span class="row-lbl">Saldo restante</span><span class="row-val" style="color:#b45309">${fmtR(loc.saldo)}</span></div>`
    : `<div style="text-align:center;font-size:12px;color:#059669;font-weight:700;margin:8px 0">✓ Locação quitada</div>`
  }

  <div class="divider"></div>
  ${cfg.pixKey ? `
  <div style="text-align:center;margin:12px 0">
    <div style="font-size:10px;font-weight:700;color:${cor};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Pagar via Pix</div>
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(cfg.pixKey)}" style="width:120px;height:120px;border-radius:8px;border:2px solid ${cor}20" alt="QR Code Pix">
    <div style="font-size:10px;color:#888;margin-top:6px">Chave: <strong style="color:#1a0a14">${cfg.pixKey}</strong></div>
  </div>
  <div class="divider"></div>` : ""}
  <div class="rodape">
    ${cfg.nome || "Katreseli"}<br>
    ${cfg.rodAluguel || ""}<br>
    Recibo emitido em ${hoje} às ${hora}
  </div>
</div>
<script>window.onload = () => window.print();</script>
</body></html>`;

  // Salvar recibo no Firestore para o cliente visualizar
  if (locId) {
    const reciboData = {
      html:  html,
      valor: valorPago,
      tipo:  tipo,
      forma: forma,
      data:  new Date(),
      num:   num
    };
    updateDoc(doc(db, "locacoes", locId), {
      recibos: [...(locacoes.find(x => x.id === locId)?.recibos || []), reciboData]
    }).catch(() => {});
  }

  const w = window.open("", "_blank", "width=420,height=600");
  if (w) { w.document.write(html); w.document.close(); }
  else notif("Ative pop-ups para gerar o recibo", true);
}

// API pública
window.gerarRecibo = gerarRecibo;

// Gerar recibo após confirmar saldo
window.gerarReciboSaldo = function(locId, valor, forma) {
  const l = locacoes.find(x => x.id === locId); if (!l) return;
  const tipo = (l.saldo || 0) <= 0.01 ? "quitacao" : "parcial";
  gerarRecibo(locId, valor, forma, tipo);
};

// ─── Recibo de confirmação de locação (gerado ao concluir venda) ──────────────
export function gerarReciboConfirmacao(loc) {
  if (!loc) return;
  const c   = (window._clientes || []).find(x => x.id === loc.clienteId) || {};
  const num = String(loc.id || "").slice(-6).toUpperCase();
  const cor = (window._cfg || {}).cor || "#d4307a";
  const cfg2 = window._cfg || { nome: "Katreseli", slogan: "Locações de Decoração Infantil", logo: "", rodAluguel: "" };
  const hoje = new Date().toLocaleDateString("pt-BR");
  const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const tipoLabel = loc.saldo <= 0 ? "Locação quitada" : "Entrada / Sinal";
  const itensHtml = (loc.itens || []).filter(x => x.tipo !== "kit")
    .map(it => `<div class="rc-item"><span>${it.nome} ×${it.qtd}</span></div>`)
    .join("");

  function _fmtR(v) {
    return "R$ " + (parseFloat(v)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function _fmtD(ds) {
    if (!ds) return "-"; const [y,m,d] = ds.split("-"); return `${d}/${m}/${y}`;
  }

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recibo #${num}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;color:#1a0a14;background:#f5f0f4}
@media print{@page{size:A5;margin:10mm}body{background:#fff}.no-print{display:none!important}}
.wrap{max-width:420px;margin:20px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 6px 40px #0003}
.hd{background:${cor};color:#fff;padding:24px 20px;text-align:center}
.hd-logo{font-size:20px;font-weight:800;margin-bottom:2px}
.hd-sub{font-size:11px;opacity:.8;margin-bottom:10px}
.hd-num{display:inline-block;background:#fff2;border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700}
.bd{padding:20px}
.sec{font-size:9px;font-weight:800;color:${cor};text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 8px}
.sec:first-child{margin-top:0}
.row{display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;gap:8px}
.row-lbl{color:#888;flex-shrink:0}
.row-val{font-weight:600;text-align:right}
.rc-item{display:flex;font-size:12px;padding:5px 0;border-bottom:1px solid #f0edf4;color:#444}
.rc-item span:first-child{color:#444}
.rc-item span:last-child{font-weight:600;color:${cor}}
.valor-box{background:${cor}12;border:2px solid ${cor}40;border-radius:12px;padding:16px;text-align:center;margin:16px 0}
.valor-lbl{font-size:10px;color:${cor};text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px}
.valor-num{font-size:28px;font-weight:800;color:${cor}}
.valor-tipo{font-size:12px;color:#666;margin-top:4px}
.saldo-box{background:#fefce8;border:1.5px solid #fde68a;border-radius:10px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;font-size:13px}
.quitado{background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:10px 14px;text-align:center;font-size:13px;font-weight:700;color:#15803d}
.divider{border-top:1.5px dashed #e5ddf0;margin:14px 0}
.rodape{text-align:center;font-size:10px;color:#aaa;padding:14px 20px;border-top:1px solid #f0edf4;line-height:1.7}
.no-print{display:flex;gap:10px;padding:16px 20px;border-top:1px solid #f0edf4;background:#faf8fc}
.btn-a{flex:1;padding:10px;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:7px;transition:opacity .15s}
.btn-a:hover{opacity:.88}
.btn-print{background:${cor}15;color:${cor}}
.btn-wpp{background:#16a34a;color:#fff}
</style></head><body>
<div class="wrap">
  <div class="hd">
    ${cfg2.logo ? `<img src="${cfg2.logo}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;margin-bottom:8px">` : `<div style="font-size:32px;margin-bottom:6px">🎀</div>`}
    <div class="hd-logo">${cfg2.nome || "Katreseli"}</div>
    <div class="hd-sub">${cfg2.slogan || "Locações de Decoração Infantil"}</div>
    <div class="hd-num">Recibo #${num}</div>
  </div>

  <div class="bd">
    <div class="sec">Cliente</div>
    <div class="row"><span class="row-lbl">Nome</span><span class="row-val">${c.nome || "—"}</span></div>
    ${c.cpf ? `<div class="row"><span class="row-lbl">CPF</span><span class="row-val">${c.cpf}</span></div>` : ""}

    <div class="sec">Evento</div>
    <div class="row"><span class="row-lbl">Tipo</span><span class="row-val">${loc.evento || "—"}</span></div>
    <div class="row"><span class="row-lbl">Retirada</span><span class="row-val">${_fmtD(loc.retirada)}</span></div>
    <div class="row"><span class="row-lbl">Devolução</span><span class="row-val">${_fmtD(loc.devolucao)}</span></div>
    ${loc.local ? `<div class="row"><span class="row-lbl">Local</span><span class="row-val">${loc.local}</span></div>` : ""}

    <div class="sec">Itens</div>
    ${itensHtml || '<div style="font-size:12px;color:#aaa">Nenhum item</div>'}

    <div class="valor-box">
      <div class="valor-lbl">Valor total</div>
      <div class="valor-num">${_fmtR(loc.total)}</div>
      <div class="valor-tipo">${loc.pagamento || ""}</div>
    </div>

    <div class="row"><span class="row-lbl">Entrada paga</span><span class="row-val" style="color:#15803d;font-size:14px">${_fmtR(loc.entrada)}</span></div>

    ${(loc.saldo || 0) > 0
      ? `<div class="saldo-box"><span>Saldo na entrega</span><span style="font-weight:800;color:#b45309">${_fmtR(loc.saldo)}</span></div>`
      : `<div class="quitado">✓ Locação quitada</div>`}

    <div class="divider"></div>
    <div style="font-size:11px;color:#aaa;text-align:center">Emitido em ${hoje} às ${hora}</div>
  </div>

  <div class="rodape">
    ${cfg2.nome || "Katreseli"} — ${cfg2.rodAluguel || cfg2.slogan || ""}<br>
    Guarde este recibo como comprovante da sua locação.
  </div>

  <div class="no-print">
    <button class="btn-a btn-print" onclick="window.print()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      Imprimir
    </button>
    ${c.tel ? `<button class="btn-a btn-wpp" onclick="enviarReciboWhats()">
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.133 1.527 5.887L.057 23.996l6.304-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.981.999-3.648-.235-.374A9.856 9.856 0 012.118 12C2.118 6.533 6.533 2.118 12 2.118S21.882 6.533 21.882 12 17.467 21.882 12 21.882z"/></svg>
      Enviar WhatsApp
    </button>` : ""}
  </div>
</div>
<script>
function enviarReciboWhats() {
  const tel = "${(c.tel||"").replace(/\D/g,"")}";
  const nome = "${(c.nome||"").split(" ")[0]}";
  const num = "${num}";
  const total = "${_fmtR(loc.total)}";
  const entrada = "${_fmtR(loc.entrada)}";
  const saldo = "${_fmtR(loc.saldo||0)}";
  const evento = "${loc.evento||""}";
  const retirada = "${_fmtD(loc.retirada)}";
  const devolucao = "${_fmtD(loc.devolucao)}";
  const empresa = "${cfg2.nome||"Katreseli"}";
  const quitado = ${(loc.saldo||0) <= 0};
  const msg = quitado
    ? \`✅ *\${empresa} — Recibo #\${num}*

Olá, *\${nome}*! Sua locação foi confirmada e quitada! 🎉

🎉 *Evento:* \${evento}
📅 *Retirada:* \${retirada}
📅 *Devolução:* \${devolucao}

💰 *Valor total:* \${total}
✅ *Locação quitada!*

_\${empresa}_\`
    : \`🎀 *\${empresa} — Recibo #\${num}*

Olá, *\${nome}*! Sua locação está confirmada! 🎉

🎉 *Evento:* \${evento}
📅 *Retirada:* \${retirada}
📅 *Devolução:* \${devolucao}

💰 *Valor total:* \${total}
✅ *Entrada paga:* \${entrada}
📌 *Saldo na entrega:* \${saldo}

_\${empresa}_\`;
  const cc = tel.startsWith("55") ? tel : "55"+tel;
  window.open("https://wa.me/"+cc+"?text="+encodeURIComponent(msg), "_blank");
}
</script>
</body></html>`;

  // Salvar recibo de confirmação no Firestore
  if (loc.id) {
    const reciboData = {
      html:  html,
      valor: loc.entrada || loc.total || 0,
      tipo:  (loc.saldo || 0) <= 0 ? "quitacao" : "entrada",
      forma: loc.pagamento || "",
      data:  new Date(),
      num:   String(loc.id).slice(-6).toUpperCase()
    };
    updateDoc(doc(db, "locacoes", loc.id), {
      recibos: [...(loc.recibos || []), reciboData]
    }).catch(() => {});
  }

  const w = window.open("", "_blank", "width=480,height=700");
  if (w) { w.document.write(html); w.document.close(); }
  else if (window.notif) window.notif("Ative pop-ups para ver o recibo", true);
}

window.gerarReciboConfirmacao = gerarReciboConfirmacao;
