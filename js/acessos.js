/**
 * acessos.js — Gerenciamento de usuários e perfis de acesso
 * Perfis: admin | operador | cliente
 */
import { db, collection, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp } from "./firebase.js";
import { notif }      from "./helpers.js";

// ─── Estado ──────────────────────────────────────────────────────────────────
let _usuarios = [];
let _unsubUsuarios = null;

// ─── Perfis disponíveis ───────────────────────────────────────────────────────
export const PERFIS = {
  admin: {
    label:  "Administrador",
    icon:   "ti-shield-check",
    cor:    "#d4307a",
    bg:     "#fce4f3",
    desc:   "Acesso total ao sistema — locações, clientes, financeiro e configurações",
    paginas: ["*"]
  },
  operador: {
    label:  "Operador",
    icon:   "ti-user-check",
    cor:    "#0369a1",
    bg:     "#e0f2fe",
    desc:   "Acesso a locações, clientes, itens e calendário — sem financeiro nem configurações",
    paginas: ["dashboard","locacoes","clientes","itens","decoracoes","calendario","solicitacoes","relatorios"]
  },
  cliente: {
    label:  "Cliente",
    icon:   "ti-user",
    cor:    "#059669",
    bg:     "#d1fae5",
    desc:   "Acesso somente ao catálogo público — não entra no painel administrativo",
    paginas: []
  }
};

// ─── Carregar usuários do Firestore ──────────────────────────────────────────
export function iniciarAcessos() {
  if (_unsubUsuarios) return;

  // Renderizar admins fixos a partir do usuário logado (sem expor emails no HTML)
  const adminDiv = document.getElementById("admins-lista");
  if (adminDiv) {
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js").then(m => {
      const user = m.getAuth().currentUser;
      const email = user?.email || "";
      const nome  = user?.displayName || email.split("@")[0];
      adminDiv.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--pl);border-radius:10px;border:1px solid var(--bdr2)">
          <div style="width:34px;height:34px;border-radius:50%;background:#d4307a;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${user?.photoURL ? `<img src="${user.photoURL}" style="width:34px;height:34px;border-radius:50%;object-fit:cover">` : `<i class="ti ti-crown" style="color:#fff;font-size:15px"></i>`}
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;color:#9d174d">${nome}</div>
            <div style="font-size:11px;color:#be185d">••••••@${email.split("@")[1] || "..."}</div>
          </div>
          <span style="margin-left:auto;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:#d4307a;color:#fff">ADMIN</span>
        </div>`;
    }).catch(() => {});
  }

  // Mostrar loading enquanto carrega
  const tbody = document.getElementById("tb-usuarios");
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--txt3)">
    <div class="spin" style="margin:0 auto 10px"></div>Carregando usuários...
  </td></tr>`;

  const q = query(collection(db, "usuarios"), orderBy("criadoEm", "desc"));
  _unsubUsuarios = onSnapshot(q,
    snap => {
      _usuarios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTabelaUsuarios();
    },
    err => {
      // Erro (offline ou permissão) — mostrar mensagem amigável
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--txt3)">
        <i class="ti ti-wifi-off" style="font-size:28px;display:block;margin-bottom:8px;opacity:.4"></i>
        <div style="font-size:13px;margin-bottom:4px">Sem conexão com o servidor</div>
        <div style="font-size:11px">Verifique sua internet e <a href="#" onclick="location.reload()" style="color:var(--p)">recarregue a página</a></div>
      </td></tr>`;
      _unsubUsuarios = null; // permite tentar novamente
    }
  );
}

// ─── Verificar permissão do usuário logado ────────────────────────────────────
export async function verificarPermissao(email) {
  // Não usar lista hardcoded — verificar via custom claims ou coleção usuarios
  try {
    const { getDocs, where } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const snap = await getDocs(query(collection(db, "usuarios"), where("email","==",email)));
    if (!snap.empty) {
      const u = snap.docs[0].data();
      if (!u.ativo) return { perfil: u.perfil, ativo: false };
      return { perfil: u.perfil, ativo: true };
    }
    // Se não está na coleção usuarios mas passou pela verificação isAdmin() do Firebase
    // (token custom claim ou email na lista do rules) — tratar como admin
    return { perfil: "admin", ativo: true };
  } catch(_) { return { perfil: "admin", ativo: true }; }
}
window.verificarPermissao = verificarPermissao;

// ─── Renderizar tabela ────────────────────────────────────────────────────────
function renderTabelaUsuarios() {
  const tbody = document.getElementById("tb-usuarios");
  if (!tbody) return;

  if (!_usuarios.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--txt3)">
      <i class="ti ti-users" style="font-size:28px;display:block;margin-bottom:8px;opacity:.4"></i>
      Nenhum usuário cadastrado ainda.<br>
      <span style="font-size:12px">Os admins fixos sempre terão acesso.</span>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = _usuarios.map(u => {
    const p = PERFIS[u.perfil] || PERFIS.operador;
    const ativo = u.ativo !== false;
    return `<tr>
      <td data-label="Usuário">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:${p.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="ti ${p.icon}" style="color:${p.cor};font-size:16px"></i>
          </div>
          <div>
            <div style="font-weight:600;font-size:13px;color:var(--txt)">${u.nome || u.email.split("@")[0]}</div>
            <div style="font-size:11px;color:var(--txt3)">${u.email}</div>
          </div>
        </div>
      </td>
      <td data-label="Perfil">
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${p.bg};color:${p.cor}">
          <i class="ti ${p.icon}" style="font-size:10px"></i> ${p.label}
        </span>
      </td>
      <td data-label="Status">
        <label class="toggle-sw" title="${ativo ? "Clique para bloquear" : "Clique para ativar"}">
          <input type="checkbox" ${ativo ? "checked" : ""} onchange="toggleAtivoUsuario('${u.id}', this.checked)">
          <span class="toggle-sl"></span>
        </label>
      </td>
      <td data-label="Adicionado" style="font-size:12px;color:var(--txt3)">
        ${u.criadoEm?.seconds ? new Date(u.criadoEm.seconds*1000).toLocaleDateString("pt-BR") : "—"}
      </td>
      <td data-label="Ações">
        <div style="display:flex;gap:6px">
          <button class="btn btn-s btn-xs" onclick="editarUsuario('${u.id}')"><i class="ti ti-edit"></i></button>
          <button class="btn btn-d btn-xs" onclick="excluirUsuario('${u.id}','${u.nome || u.email}')"><i class="ti ti-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

// ─── Abrir modal de novo/editar usuário ───────────────────────────────────────
window.abrirNovoUsuario = function() {
  _abrirModalUsuario(null);
};

window.editarUsuario = function(id) {
  const u = _usuarios.find(x => x.id === id);
  if (u) _abrirModalUsuario(u);
};

function _abrirModalUsuario(u) {
  const ov = document.getElementById("modal-usuario");
  if (!ov) return;
  const isNew = !u;

  document.getElementById("mu-titulo").textContent = isNew ? "Novo usuário" : "Editar usuário";
  document.getElementById("mu-nome").value   = u?.nome  || "";
  document.getElementById("mu-email").value  = u?.email || "";
  document.getElementById("mu-email").disabled = !isNew;
  document.getElementById("mu-id").value     = u?.id    || "";

  // Selecionar perfil
  document.querySelectorAll(".perfil-card").forEach(c => c.classList.remove("on"));
  const perfilAtual = u?.perfil || "operador";
  const card = document.querySelector(`.perfil-card[data-perfil="${perfilAtual}"]`);
  if (card) card.classList.add("on");

  ov.style.display = "flex";
  ov.classList.add("on");
  setTimeout(() => document.getElementById("mu-nome").focus(), 100);
}

// ─── Salvar usuário ───────────────────────────────────────────────────────────
window.salvarUsuario = async function() {
  const nome  = document.getElementById("mu-nome")?.value.trim();
  const email = document.getElementById("mu-email")?.value.trim().toLowerCase();
  const id    = document.getElementById("mu-id")?.value;
  const perfil = document.querySelector(".perfil-card.on")?.dataset.perfil || "operador";

  if (!email || !email.includes("@")) { notif("E-mail inválido", true); return; }
  if (!nome)  { notif("Informe o nome", true); return; }

  // Não permitir sobrescrever admins fixos
  const ADMINS_FIXOS = atob("a3NhbnRpMTZAZ21haWwuY29tLGxvaXNsZW5lLmNyaXN0aW5lMDVAZ21haWwuY29t").split(",");
  if (ADMINS_FIXOS.includes(email) && perfil !== "admin") {
    notif("Este e-mail é administrador fixo e não pode ter o perfil alterado.", true); return;
  }

  try {
    if (id) {
      await updateDoc(doc(db, "usuarios", id), { nome, perfil, atualizadoEm: serverTimestamp() });
      notif("Usuário atualizado!");
    } else {
      await setDoc(doc(collection(db, "usuarios")), {
        nome, email, perfil, ativo: true, criadoEm: serverTimestamp()
      });
      notif("Usuário adicionado!");
    }
    fecharModalUsuario();
  } catch(e) { notif("Erro: " + e.message, true); }
};

// ─── Toggle ativo/inativo ─────────────────────────────────────────────────────
window.toggleAtivoUsuario = async function(id, ativo) {
  try {
    await updateDoc(doc(db, "usuarios", id), { ativo });
    notif(ativo ? "Usuário ativado" : "Usuário bloqueado");
  } catch(e) { notif("Erro", true); }
};

// ─── Excluir usuário ──────────────────────────────────────────────────────────
window.excluirUsuario = async function(id, nome) {
  if (!await window.confirmar({ titulo:"Remover acesso", msg:`Deseja remover o acesso de "${nome}"?`, tipo:"danger", labelOk:"Remover" })) return;
  try {
    await deleteDoc(doc(db, "usuarios", id));
    notif("Usuário removido");
  } catch(e) { notif("Erro", true); }
};

// ─── Fechar modal ─────────────────────────────────────────────────────────────
window.fecharModalUsuario = function() {
  const ov = document.getElementById("modal-usuario");
  if (!ov) return;
  ov.classList.remove("on");
  setTimeout(() => ov.style.display = "none", 200);
};

// ─── Selecionar perfil no modal ───────────────────────────────────────────────
window.selecionarPerfil = function(el) {
  document.querySelectorAll(".perfil-card").forEach(c => c.classList.remove("on"));
  el.classList.add("on");
};

// Expor para uso global
window.iniciarAcessos = iniciarAcessos;
