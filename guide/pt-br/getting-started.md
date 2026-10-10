# Primeiros passos

Cinco minutos do zero até o seu primeiro termo guardado.

> Esta é a tradução para o português dos [primeiros passos em inglês](../getting-started.md). As demais páginas por enquanto existem só em inglês: veja a [documentação em inglês](../README.md).

## 1. Instalar

O Harkback é uma extensão do Chrome (Manifest V3). Ainda não há uma página na loja, então ela é carregada a partir do código-fonte. Você precisa do Node 22 ou mais recente e do [pnpm](https://pnpm.io).

```sh
git clone https://github.com/zestworks-io/harkback.git
cd harkback
pnpm install
pnpm --filter @harkback/extension build
```

Abra `chrome://extensions`, ative o **Modo do desenvolvedor**, escolha **Carregar sem compactação** e selecione `apps/extension/.output/chrome-mv3`. A página de boas-vindas abre sozinha.

Depois de baixar código novo, compile de novo e clique no ícone de recarregar no cartão da extensão.

## 2. Conectar um modelo

O Harkback não tem servidor. Ele precisa de um modelo para escrever as explicações, e você escolhe qual. A página de boas-vindas tem três etapas; uma etapa concluída mostra ✓ e pode ser clicada para voltar a ela.

1. **Boas-vindas.** Veja um exemplo de aviso de reencontro e clique no termo sublinhado para ver como é uma explicação. Nenhum modelo é chamado.
2. **Privacidade.** Leia para onde vai o seu texto e marque a caixa de consentimento. **Avançar** fica desativado até você fazer isso.
3. **Modelo.** Escolha um provedor; o endereço é preenchido. Cole uma chave de API se o provedor precisar (o Ollama e o modelo integrado do Chrome não precisam). Pressione **Testar conexão**, e o Chrome pergunta se o Harkback pode acessar esse endereço; permita. Um indicador giratório e “Conectando…” aparecem enquanto o teste roda, e o botão fica desativado até terminar. Depois pressione **Concluir configuração**.

**O modelo integrado do Chrome (Gemini Nano)** não precisa de endereço nem de chave. Ao selecioná-lo, aparecem o status do modelo e um botão **Baixar modelo**; **Concluir configuração** espera o download terminar. É um modelo pequeno que roda no seu computador, então espere que seja mais lento que um modelo na nuvem, especialmente na primeira solicitação, com respostas mais simples. Serve para explicações curtas.

Você pode adicionar mais modelos e mudar opções depois, na página de configurações. Executar a configuração de novo atualiza o modelo que você já tem; não adiciona uma segunda cópia.

A opção gratuita mais fácil é um modelo local com o [Ollama](https://ollama.com). Ela exige uma etapa extra, porque o Ollama recusa solicitações de extensões do navegador até você permitir a origem da extensão. O botão de teste mostra o comando exato para o seu sistema. Veja [Modelos e provedores](../models.md) para todos os provedores e para rodar um modelo em outro computador da sua rede doméstica.

A interface começa em inglês. Você pode mudar o idioma dela, e o das explicações, na página de boas-vindas ou nas configurações.

## 3. Explicar um termo

1. Abra um artigo em [arxiv.org](https://arxiv.org). As páginas do arXiv são escaneadas automaticamente.
2. Selecione um termo, por exemplo `LoRA`.
3. Clique em **Explicar** ao lado da seleção, ou pressione `Alt+Shift+E`.
4. Leia a resposta enquanto ela chega. Uma etiqueta verde diz que a própria página define o termo; uma amarela diz que a resposta vem do conhecimento do modelo.
5. Pressione **Entendi** ou **Ainda confuso**. Essa resposta é a primeira nota do termo e decide quando o Harkback o traz de volta para revisão.

Outras formas de começar: o menu de contexto do texto selecionado e uma seleção feita pelo teclado ou por toque.

## 4. Reencontrar o termo

Abra outro artigo que mencione `LoRA`, `low-rank adaptation` ou `LoRAs`. O termo aparece sublinhado. Passe o ponteiro por cima para ver quando e onde você o consultou e o que entendeu na época. Você pode marcá-lo como lembrado, explicá-lo de novo, comparar os dois usos ou silenciá-lo.

## 5. Ver o que você tem

Abra a página **Histórico** (com link nas configurações e nas boas-vindas). Ela lista cada termo por conceito, com busca, conversas de acompanhamento, uma fila de revisão e um grafo de como seus conceitos se conectam. De lá você também pode exportar seus registros e restaurá-los a partir de um backup.

## Ler algo que não está no arXiv

- **Uma página da web:** clique uma vez no botão da barra de ferramentas. Para escanear um site automaticamente daí em diante, adicione-o em _Sites_ nas configurações.
- **Um PDF:** clique no botão da barra de ferramentas no PDF. PDFs do arXiv abrem na versão HTML; os outros PDFs abrem no leitor próprio do Harkback. Um PDF no seu computador precisa de duas aprovações na primeira vez; veja [Solução de problemas](../troubleshooting.md#a-pdf-on-my-computer-will-not-open).
- **Algo confidencial:** marque antes o site ou a fonte como sensível. Veja [Privacidade e fontes sensíveis](../privacy.md).

## Próximos passos

[Guia do usuário](../user-guide.md) · [Modelos e provedores](../models.md) · [Solução de problemas](../troubleshooting.md)
