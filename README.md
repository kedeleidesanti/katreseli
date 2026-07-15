# Katreseli — Sistema de Locações de Decoração Infantil

## ⚡ Fluxo de Deploy (obrigatório)

### Antes de cada upload para o Hostinger:

```bash
node build.js
```

Esse comando:
- Gera um `BUILD_ID` único com data/hora atual (ex: `2605301530`)
- Atualiza `CACHE_V` no `sw.js` → browser baixa o novo Service Worker
- Adiciona `?v=BUILD_ID` em todos os `<script src>` e `<link href>` → quebra cache

### Deploy completo (com Git ligado ao Hostinger):

```bash
node build.js
git add -A
git commit -m "deploy: v$(node -e "console.log(require('./manifest.json')._build)")"
git push hostinger main
```

Se preferir via FTP/painel, rode `node build.js` e faça upload de todos os arquivos.

---

## Por que o `build.js` é necessário?

O browser e o Service Worker guardam arquivos em cache. Sem o `build.js`:
- O `sw.js` não muda → browser não baixa novo Service Worker
- Os arquivos JS ficam em cache → usuário vê versão antiga mesmo após deploy

Com o `build.js`:
- `sw.js` muda (novo `CACHE_V`) → browser instala novo SW na próxima visita
- `?v=...` nos assets → browser baixa os arquivos frescos do servidor
- O novo SW usa `network-first` para `.html` e `.js` → sempre versão atual

---

## Estrutura do Projeto

```
/
├── build.js            ← Script de pré-deploy (rodar antes de subir)
├── package.json        ← "npm run build" atalho para build.js
├── sw.js               ← Service Worker (CACHE_V atualizado pelo build.js)
├── manifest.json       ← PWA manifest
├── index.html          ← Catálogo público
├── adm.html            ← Painel administrativo
├── cliente.html        ← Área do cliente
├── solicitar.html      ← Formulário de solicitação
├── firestore.rules     ← Regras de segurança do Firestore
├── css/
│   └── style.css
└── js/
    ├── firebase.js     ← Config Firebase
    ├── state.js        ← Estado global
    ├── helpers.js      ← Utilitários
    ├── auth.js         ← Autenticação Google
    ├── navigation.js   ← Roteamento e modais
    ├── main.js         ← Bootstrap — inicia todos os listeners
    ├── locacoes.js     ← CRUD locações
    ├── clientes.js     ← CRUD clientes
    ├── itens.js        ← CRUD itens e categorias
    ├── decoracoes.js   ← CRUD kits de decoração
    ├── renders.js      ← Dashboard, financeiro, calendário
    ├── config.js       ← Configurações do sistema
    ├── acessos.js      ← Gerenciamento de usuários
    ├── solicitacoes.js ← Solicitações do catálogo público
    ├── notificacoes.js ← Notificações e alertas
    ├── whatsapp.js     ← Mensagens WhatsApp
    ├── contrato.js     ← Gerador de contrato PDF
    ├── qrcode.js       ← Link de orçamento / QR code
    ├── link-confirmacao.js ← Link de confirmação de locação
    ├── nota-checklist.js   ← Checklist de entrega/devolução
    ├── financeiro-extra.js ← Extras financeiros
    ├── caixa.js        ← Caixa e movimentações
    ├── agenda.js       ← Agenda de eventos
    ├── estoque.js      ← Controle de estoque
    ├── relatorio-mensal.js ← Relatório mensal
    └── manutencao.js   ← Manutenções e avarias
```

## Regras do Firestore

Após alterar `firestore.rules`, publicar via:
```bash
firebase deploy --only firestore:rules
```
Ou cole manualmente em: Firebase Console → Firestore → Regras
