/**
 * main.js — Ponto de entrada. Inicia listeners e importa todos os módulos.
 * NÃO importa auth.js (auth.js importa startListeners diretamente daqui via window).
 */
import { db, collection, onSnapshot } from "./firebase.js";
import { doc, updateDoc }             from "./firebase.js";
import { el }                         from "./helpers.js";
import { setItens, setDecoracoes, setClientes, setLocacoes } from "./state.js";
import { locacoes as _loc, clientes as _clis, itens as _its } from "./state.js";
import { renderSelectCat, renderChipsCat, loadCats } from "./itens.js";
import { loadCfg }  from "./config.js";
import { loadClausulas, renderClausulas } from "./clausulas.js";
import { setCustos, renderContasReceber, renderGraficoMensal, renderCustos } from "./financeiro-extra.js";
import { verificarAniversarios, renderPrevisaoEstoque, renderSugestaoPreco, renderMetas } from "./clientes-extra.js";
import { setManutencoes, renderManutencoes } from "./manutencao.js";
import { loadModelosContrato, modelosContrato } from "./editor-contrato.js";
import { iniciarCupons } from "./cupons.js";
import { verificarNotificacoes, escutarPagamentosConfirmados } from "./notificacoes.js";
import { renderAgenda } from "./agenda.js";
import { iniciarSolicitacoesListener } from "./solicitacoes.js";
import { sincronizarPrecoItensKit } from "./decoracoes.js";

// ─── Expor startListeners globalmente ANTES de qualquer outro módulo ─────────
window.startListeners = startListeners;

export function startListeners() {
  loadCats();
  loadCfg();
  loadModelosContrato();
  loadClausulas();
  iniciarSolicitacoesListener();
  iniciarCupons();

  // Transações online — só carrega se tiver permissão
  try {
    onSnapshot(collection(db, "transacoes"), snap => {
      const trans = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
      window._transacoes = trans;
      window.renderTransacoes?.();
    }, err => {
      // Regra ainda não publicada no Firebase — silencia e mostra vazio
      window._transacoes = [];
      window.renderTransacoes?.();
    });

    // Comprovantes de pagamento enviados pelos clientes
    onSnapshot(collection(db, "comprovantes_pag"), snap => {
      window._comprovantes_pag = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => (b.criadoEm?.seconds||0) - (a.criadoEm?.seconds||0));
      window.renderComprovantesAdmin?.();
    }, () => { window._comprovantes_pag = []; });
  } catch(_) {}

  onSnapshot(collection(db, "itens"), snap => {
    // Detectar itens cujo preço de aluguel mudou ANTES de atualizar o estado
    const itensMudados = snap.docChanges()
      .filter(c => c.type === "modified")
      .map(c => ({ id: c.doc.id, aluguel: c.doc.data().aluguel || 0 }));

    setItens(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    window.renderItens?.();
    window.renderDash?.();
    if (el("bdg-it")) el("bdg-it").textContent = snap.docs.length;
    renderSelectCat();
    renderChipsCat();

    // Sincronizar preços em kits de decoração para itens alterados
    for (const { id, aluguel } of itensMudados) {
      sincronizarPrecoItensKit(id, aluguel);
    }
  });

  onSnapshot(collection(db, "decoracoes"), snap => {
    setDecoracoes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    window.renderDecs?.();
  });

  onSnapshot(collection(db, "clientes"), snap => {
    setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    _atualizarStateSearch();
    window.renderClis?.();
    window.renderDash?.();
    verificarAniversarios();
    renderMetas();
  });

  onSnapshot(collection(db, "custos"), snap => {
    setCustos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    renderCustos();
    renderGraficoMensal();
  });

  onSnapshot(collection(db, "manutencoes"), snap => {
    setManutencoes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    renderManutencoes();
    const cnt = document.getElementById("cnt-manut");
    if (cnt) cnt.textContent = snap.docs.filter(d => d.data().status === "em_manutencao").length;
  });

  onSnapshot(collection(db, "locacoes"), snap => {
    setLocacoes(snap.docs.map(d => ({ id: d.id, ...d.data() })));

    // onSnapshot atualiza o array de locacoes

    // ── Migração automática: setar temEntrega nas locações que têm entrega ──
    if (!window._migEntregaFeita) {
      window._migEntregaFeita = true;
      snap.docs.forEach(d => {
        const data = d.data();
        // Re-detecta sempre (sobrescreve false anterior)

        const ent = data.entrega;
        // Detecção 1: campo entrega direto
        let tem = (typeof ent === "number" && ent > 0) ||
                  (typeof ent === "object" && ent && (ent.val > 0 || ent.km > 0)) ||
                  !!(data.entregaEnd);

        // Detecção 2: total maior que soma itens + montagem (diferença = entrega)
        if (!tem && data.total > 0) {
          const somaItens = (data.itens || [])
            .filter(i => i.tipo !== "kit")
            .reduce((a, i) => a + (i.preco || 0) * (i.qtd || 1), 0);
          const mont = (data.horas || 0) * (data.valorHora || 0);
          const desc = data.desconto || 0;
          const esperado = somaItens + mont - desc;
          const diff = Math.round((data.total - esperado) * 100) / 100;
          if (diff > 0.5) tem = true; // diferença positiva = entrega
        }

        updateDoc(doc(db, "locacoes", d.id), { temEntrega: tem }).catch(() => {});
      });
    }

    // ── Migração: adicionar emailCliente nas locações existentes ──────────────
    if (!window._migEmailClienteFeita) {
      window._migEmailClienteFeita = true;
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.emailCliente) return;
        if (!data.clienteId) return;
        const cli = _clis.find(c => c.id === data.clienteId);
        if (cli?.email) {
          updateDoc(doc(db, "locacoes", d.id), { emailCliente: cli.email }).catch(() => {});
        }
      });
    }

    _atualizarStateSearch();
    window.renderLoc?.();
    window.renderClis?.(); // atualiza contagem de locações por cliente
    window.renderDash?.();
    window.renderCal?.();
    window.renderFin?.();
    window.renderRel?.();
    verificarNotificacoes();
    escutarPagamentosConfirmados();
    renderContasReceber();
    renderGraficoMensal();
    renderPrevisaoEstoque();
    renderSugestaoPreco();
    renderMetas();
    window.verificarOrcamentosExpirados?.();
    if (document.getElementById("view-agenda")?.style.display !== "none") renderAgenda();
    if (el("bdg-at")) el("bdg-at").textContent = snap.docs.filter(d => ["ativo","aguardando_entrada"].includes(d.data().status)).length;
  });
}

// ─── Importar todos os módulos (registram handlers no window) ────────────────
import "./navigation.js";
import "./clientes.js";
import "./itens.js";
import "./decoracoes.js";
import "./locacoes.js";
import "./renders.js";
import "./contrato.js";
import "./config.js";
import "./estoque.js";
import "./clientes-extra.js";
import "./financeiro-extra.js";
import "./manutencao.js";
import "./recibo.js";
import "./qrcode.js";
import "./clausulas.js";
import "./editor-contrato.js";
import "./whatsapp.js";
import "./notificacoes.js";
import "./agenda.js";
import "./relatorio-mensal.js";
import "./auth.js";   // auth por último — usa window.startListeners já definido acima
import "./caixa.js";
import "./nota-checklist.js";
import "./link-confirmacao.js";
import "./catalogo.js";
import "./solicitacoes.js";
import { iniciarAcessos } from "./acessos.js";

// Expor estado para busca global (renderBuscaGlobal em navigation.js usa window._stateSearch)
function _atualizarStateSearch() {
  window._stateSearch = { locacoes: _loc, clientes: _clis, itens: _its };
}
_atualizarStateSearch();
// Atualiza a cada snapshot via onSnapshot — não precisa de setInterval

// Iniciar gerenciamento de usuários/acessos
iniciarAcessos();
