# Como aplicar as Regras de Segurança do Firestore

1. Acesse https://console.firebase.google.com/project/katreseli/firestore/rules
2. Cole o conteúdo do arquivo `firestore.rules` no editor
3. Clique em **Publicar**

Ou via Firebase CLI:
```bash
firebase deploy --only firestore:rules
```

As regras garantem:
- Apenas os admins (ksanti16@gmail.com e loislene.cristine05@gmail.com) têm acesso total
- Clientes autenticados lêem suas próprias locações e solicitações pelo e-mail
- Solicitações do catálogo público podem ser criadas por qualquer um
- Config do app é pública para leitura (necessário para o catálogo)

⚠️ IMPORTANTE: Após atualizar as regras, a área do cliente passa a funcionar corretamente.
