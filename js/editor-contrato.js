/**
 * editor-contrato.js — Editor livre do modelo de contrato.
 * O usuário edita o contrato completo como um documento,
 * usando variáveis {{campo}} onde quiser.
 */
import { db, doc, setDoc, getDoc } from "./firebase.js";
import { el, notif }               from "./helpers.js";
import { cfg }                     from "./state.js";

// ─── Modelos padrão ───────────────────────────────────────────────────────────
const MODELO_ALUGUEL = `<p style="text-align:center"><strong>CONTRATO DE LOCAÇÃO DE ITENS DE DECORAÇÃO</strong></p>
<p style="text-align:center">Contrato nº {{numero_contrato}} &nbsp;|&nbsp; Emitido em {{data_contrato}}</p>

<p><strong>LOCADOR(A):</strong> Katreseli Decorações de Festa – CNPJ nº 61.083.661/0001-12, com sede na Rua Engenheiro Pontoni, Nº 248, neste ato representado por Loislene Cristine De Assis De Santi, doravante denominado(a) <strong>LOCADOR(A)</strong>.</p>

<p><strong>LOCATÁRIO(A):</strong> {{nome_locatario}}, CPF nº {{cpf}}, residente em {{endereco}}, telefone {{telefone}}, doravante denominado(a) <strong>LOCATÁRIO(A)</strong>.</p>

<p>As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Locação de Itens de Decoração, que se regerá pelas cláusulas seguintes e pelas condições descritas no presente.</p>

<p><strong>CLÁUSULA 1 – OBJETO DO CONTRATO</strong><br>
O presente contrato tem por objeto a locação de móveis e itens de decoração descritos na Lista de Itens Locados, destinados à montagem de festa estilo "pegue e monte" para o evento <em>{{evento}}</em>, com retirada e devolução pelo(a) LOCATÁRIO(A), salvo acordo em contrário.</p>

<p><strong>CLÁUSULA 2 – PRAZO DE LOCAÇÃO</strong><br>
O prazo de locação será de {{dias}}, iniciando-se em {{data_retirada}} e encerrando-se em {{data_devolucao}}. A devolução dos itens deve ocorrer impreterivelmente até as 18h00 do dia {{data_devolucao}}. Em caso de atraso, será cobrada multa conforme a Cláusula 6.</p>

<p><strong>CLÁUSULA 3 – VALOR E FORMA DE PAGAMENTO</strong><br>
O valor total da locação será de <strong>{{valor_total}}</strong>, a ser pago da seguinte forma:<br>
Entrada de <strong>{{entrada}}</strong> + saldo restante de <strong>{{saldo}}</strong> no ato da entrega dos itens.<br>
A reserva dos itens somente será confirmada mediante o pagamento da entrada.<br>
Forma de pagamento: {{pagamento}}.</p>

<p><strong>CLÁUSULA 4 – OBRIGAÇÕES DO(A) LOCATÁRIO(A)</strong><br>
Retirar e devolver os itens no endereço do(a) LOCADOR(A) dentro do prazo estipulado, em perfeito estado de conservação. Zelar pelos itens locados, responsabilizando-se por quaisquer danos, perdas ou extravios. Não emprestar, sublocar ou utilizar os itens para finalidades diferentes das acordadas.</p>

<p><strong>CLÁUSULA 5 – OBRIGAÇÕES DO(A) LOCADOR(A)</strong><br>
Disponibilizar os itens conforme descritos na Lista de Itens Locados, limpos, em bom estado e em conformidade com o que foi acordado com o(a) LOCATÁRIO(A). Estar disponível para esclarecimentos e suporte básico sobre montagem/desmontagem, quando solicitado.</p>

<p><strong>CLÁUSULA 6 – MULTAS E RESPONSABILIDADES</strong><br>
Em caso de atraso na devolução, será cobrada multa de R$ 100,00 (cem reais) por dia de atraso.<br>
Em caso de dano ou perda de item, será cobrado o valor de reposição do mesmo, conforme tabela vigente do(a) LOCADOR(A). O não comparecimento para retirada ou devolução sem justificativa prévia implicará perda da reserva e/ou cobrança de multa de até 100% do valor contratado.</p>

<p><strong>CLÁUSULA 7 – CANCELAMENTO</strong><br>
Cancelamentos não terão reembolso do valor pago como sinal/reserva.</p>

<p><strong>CLÁUSULA 8 – DISPOSIÇÕES FINAIS</strong><br>
Este contrato passa a valer a partir da assinatura de ambas as partes. Qualquer alteração neste contrato deverá ser feita por escrito e assinada por ambas as partes. Fica eleito o foro da comarca de Piraquara/PR para dirimir quaisquer dúvidas oriundas deste contrato.</p>

<p>E por estarem assim justos e contratados, firmam o presente instrumento em 2 (duas) vias de igual teor e forma.</p>`;

const MODELO_MONTAGEM = `<p style="text-align:center"><strong>CONTRATO DE LOCAÇÃO E MONTAGEM DE DECORAÇÃO</strong></p>
<p style="text-align:center">Contrato nº {{numero_contrato}} &nbsp;|&nbsp; Emitido em {{data_contrato}}</p>

<p><strong>LOCADOR(A):</strong> Katreseli Decorações de Festa – CNPJ nº 61.083.661/0001-12, com sede na Rua Engenheiro Pontoni, Nº 248, neste ato representado por Loislene Cristine De Assis De Santi, doravante denominado(a) <strong>LOCADOR(A)</strong>.</p>

<p><strong>CONTRATANTE:</strong> {{nome_locatario}}, CPF nº {{cpf}}, residente em {{endereco}}, telefone {{telefone}}, doravante denominado(a) <strong>CONTRATANTE</strong>.</p>

<p><strong>CLÁUSULA 1 – OBJETO</strong><br>
O presente contrato tem por objeto a prestação de serviço de montagem e desmontagem de decoração para o evento <em>{{evento}}</em>, a ser realizado em {{local}}, na data de {{data_retirada}}.</p>

<p><strong>CLÁUSULA 2 – VALOR E PAGAMENTO</strong><br>
O valor total do serviço será de <strong>{{valor_total}}</strong>, sendo <strong>{{entrada}}</strong> de entrada e <strong>{{saldo}}</strong> a ser pago na data do evento. A confirmação do serviço ocorre mediante pagamento da entrada.</p>

<p><strong>CLÁUSULA 3 – CANCELAMENTO</strong><br>
Cancelamentos com menos de 48h do evento incorrem em multa de 50% sobre {{valor_total}}. Acima de 48h, retenção de 30% do valor pago como sinal.</p>

<p><strong>CLÁUSULA 4 – DISPOSIÇÕES FINAIS</strong><br>
Fica eleito o foro da comarca de Piraquara/PR para dirimir quaisquer dúvidas oriundas deste contrato.</p>

<p>E por estarem assim justos e contratados, firmam o presente instrumento em 2 (duas) vias de igual teor e forma.</p>`;

// ─── Estado dos modelos ───────────────────────────────────────────────────────
export const modelosContrato = {
  aluguel:  "",
  montagem: ""
};

// ─── Carregar modelos do Firestore ────────────────────────────────────────────
export async function loadModelosContrato() {
  try {
    const d = await getDoc(doc(db, "config", "modelos_contrato"));
    if (d.exists()) {
      const data = d.data();
      modelosContrato.aluguel  = data.aluguel  || "";
      modelosContrato.montagem = data.montagem || "";
    }
  } catch (_) {}
  // Preencher editors
  _preencherEditor("aluguel");
  _preencherEditor("montagem");
}

function _preencherEditor(tipo) {
  const ed = el(`editor-ctr-${tipo}`);
  if (!ed) return;
  const modelo = modelosContrato[tipo];
  ed.innerHTML = modelo || (tipo === "aluguel" ? MODELO_ALUGUEL : MODELO_MONTAGEM);
  if (!modelo) {
    // Salvar o padrão automaticamente na primeira vez
    modelosContrato[tipo] = ed.innerHTML;
  }
}

// ─── Auto-salvar ao digitar (debounce) ───────────────────────────────────────
let _saveTimer = null;
window.autoSalvarModelo = function(tipo) {
  const ed = el(`editor-ctr-${tipo}`);
  if (ed) modelosContrato[tipo] = ed.innerHTML;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => _salvarModelosFirestore(), 1500);
};

async function _salvarModelosFirestore() {
  try {
    await setDoc(doc(db, "config", "modelos_contrato"), {
      aluguel:  modelosContrato.aluguel,
      montagem: modelosContrato.montagem
    });
  } catch (_) {}
}

// ─── Salvar manual (botão) ────────────────────────────────────────────────────
window.salvarCtr = async function() {
  // Salvar conteúdo dos editors
  const edA = el("editor-ctr-aluguel");
  const edM = el("editor-ctr-montagem");
  if (edA) modelosContrato.aluguel  = edA.innerHTML;
  if (edM) modelosContrato.montagem = edM.innerHTML;

  // Salvar campos de hora e rodapé
  const { gv } = window;
  if (gv) {
    cfg.hora     = parseFloat(gv("cfg-hora")) || 0;
    cfg.rodAluguel = gv("cfg-rod-aluguel") || "";
    cfg.rodMont    = gv("cfg-rod-mont")    || "";
  }

  try {
    await _salvarModelosFirestore();
    await setDoc(doc(db, "config", "app"), {
      ...cfg,
      hora:       cfg.hora,
      rodAluguel: cfg.rodAluguel,
      rodMont:    cfg.rodMont
    });
    notif("Contrato salvo!");
  } catch (e) {
    notif("Erro ao salvar: " + e.message, true);
  }
};

// ─── Restaurar modelo padrão ──────────────────────────────────────────────────
window.usarModeloPadrao = async function(tipo) {
  if (!await window.confirmar({ titulo:"Restaurar modelo padrão", msg:"O conteúdo atual do contrato será substituído pelo modelo padrão. Esta ação não pode ser desfeita.", tipo:"warning", labelOk:"Restaurar" })) return;
  const ed = el(`editor-ctr-${tipo}`);
  if (!ed) return;
  ed.innerHTML = tipo === "aluguel" ? MODELO_ALUGUEL : MODELO_MONTAGEM;
  modelosContrato[tipo] = ed.innerHTML;
  // Salvar imediatamente no Firestore para não perder na próxima carga
  await _salvarModelosFirestore();
  notif("Modelo padrão restaurado e salvo!");
};

// ─── Comandos do editor ───────────────────────────────────────────────────────
window.edCtrCmd = function(cmd) {
  // Focar no editor ativo (visível)
  const edA = el("editor-ctr-aluguel");
  const edM = el("editor-ctr-montagem");
  const ed  = (edM && edM.closest("#ctr-mont") && edM.closest("#ctr-mont").style.display !== "none")
              ? edM : edA;
  if (ed) ed.focus();
  document.execCommand(cmd, false, null);
};

window.edCtrSize = function(v) {
  const edA = el("editor-ctr-aluguel");
  const edM = el("editor-ctr-montagem");
  const ed  = (edM && edM.closest("#ctr-mont") && edM.closest("#ctr-mont").style.display !== "none")
              ? edM : edA;
  if (ed) ed.focus();
  document.execCommand("fontSize", false, v);
};

// ─── Copiar variável ──────────────────────────────────────────────────────────
window.copiarVar = function(varStr) {
  navigator.clipboard?.writeText(varStr).then(() => {
    notif(`Copiado: ${varStr}`);
  }).catch(() => {
    // Fallback
    const tmp = document.createElement("input");
    tmp.value = varStr;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand("copy");
    document.body.removeChild(tmp);
    notif(`Copiado: ${varStr}`);
  });
};

// ─── Preview do modelo com dados fictícios ────────────────────────────────────
window.previewModeloContrato = function(tipo) {
  const ed = el(`editor-ctr-${tipo}`);
  if (!ed) return;
  const html = ed.innerHTML;
  if (!html.trim()) { notif("Editor vazio!", true); return; }

  // Dados fictícios para preview
  const dadosFicticios = {
    numero_contrato: "A1B2C3",
    hoje:            new Date().toLocaleDateString("pt-BR"),
    data_contrato:   new Date().toLocaleDateString("pt-BR"),
    nome_locatario:  "Maria Silva de Souza",
    nome_cliente:    "Maria Silva de Souza",
    cpf:             "123.456.789-00",
    telefone:        "(41) 99999-9999",
    email:           "maria@email.com",
    endereco:        "Rua das Flores, 123 – Curitiba/PR",
    evento:          "Aniversário Infantil",
    local:           "Rua das Flores, 123 – Curitiba/PR",
    data_retirada:   "22/05/2026",
    data_devolucao:  "23/05/2026",
    dias:            "2 dias",
    diasNum:         "2",
    valor_total:     "R$ 250,00",
    entrada:         "R$ 125,00",
    saldo:           "R$ 125,00",
    pagamento:       "PIX",
    empresa:         cfg.nome || "Katreseli",
    responsavel:     cfg.responsavel || "Loislene",
  };

  // Substituir variáveis
  let preview = html;
  for (const [chave, valor] of Object.entries(dadosFicticios)) {
    const regex = new RegExp(`\\{\\{\\s*${chave}\\s*\\}\\}`, "gi");
    preview = preview.replace(regex, `<mark style="background:#fef08a;border-radius:3px;padding:0 2px">${valor}</mark>`);
  }
  preview = preview.replace(/@/g, `<mark style="background:#fef08a;border-radius:3px;padding:0 2px">2</mark>`);

  const rodape = (tipo === "aluguel" ? cfg.rodAluguel : cfg.rodMont) || "";
  const cor = cfg.cor || "#d4307a";

  const w = window.open("", "_blank", "width=860,height=780");
  if (!w) { notif("Ative pop-ups para visualizar", true); return; }

  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Preview do Contrato</title>
<style>
  body{font-family:"Segoe UI",Arial,sans-serif;font-size:11pt;color:#1a0a14;background:#fff;max-width:780px;margin:0 auto;padding:36px 40px;line-height:1.75}
  @media print{body{padding:20px}@page{margin:1.2cm;size:A4}}
  p{margin-bottom:10px}
  strong{color:#1a0a14}
  mark{font-style:normal}
</style></head><body>
<div id="barra" style="position:fixed;top:0;left:0;right:0;background:#1a0a14;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:10px 24px;z-index:99;font-family:sans-serif;font-size:13px">
  <span>👁 Preview — valores em <mark style="background:#fef08a;color:#000;border-radius:3px;padding:0 4px">destaque</mark> são exemplos</span>
  <div style="display:flex;gap:8px">
    <button onclick="window.print()" style="background:${cor};color:#fff;border:none;border-radius:7px;padding:6px 16px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Imprimir</button>
    <button onclick="window.close()" style="background:#fff2;color:#fff;border:1px solid #fff3;border-radius:7px;padding:6px 12px;font-size:13px;cursor:pointer">✕</button>
  </div>
</div>
<div style="height:52px"></div>
${preview}
${rodape ? `<hr style="margin-top:32px;border-color:#eee"><p style="text-align:center;font-size:9pt;color:#aaa">${rodape}</p>` : ""}
<style>@media print{#barra,div[style*="height:52px"]{display:none!important}}</style>
</body></html>`);
  w.document.close();
};

// Exportar modelos para uso no contrato
export { MODELO_ALUGUEL, MODELO_MONTAGEM };
