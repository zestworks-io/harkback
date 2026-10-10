<p align="center">
  <img src="assets/logo.png" alt="Harkback" width="96">
</p>

<h1 align="center">Harkback</h1>

<h3 align="center">
Explique os termos enquanto lê. Lembre-se do que você entendeu.<br>Recupere isso quando encontrar o termo de novo.
</h3>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <a href="CHANGELOG.md"><img alt="Version" src="https://img.shields.io/github/package-json/v/zestworks-io/harkback?filename=apps%2Fextension%2Fpackage.json&label=version&color=informational"></a>
  <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white">
  <img alt="Node 22+" src="https://img.shields.io/badge/node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Local first" src="https://img.shields.io/badge/data-local--first-success">
  <a href="https://github.com/zestworks-io/harkback/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/zestworks-io/harkback?style=flat"></a>
  <a href="https://github.com/zestworks-io/harkback/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/zestworks-io/harkback"></a>
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
</p>

<p align="center">
| <a href="#início-rápido"><b>Início rápido</b></a> | <a href="#recursos"><b>Recursos</b></a> | <a href="guide/README.md"><b>Documentação</b></a> | <a href="#privacidade"><b>Privacidade</b></a> | <a href="CHANGELOG.md"><b>Histórico de mudanças</b></a> | <a href="CONTRIBUTING.md"><b>Contribuir</b></a> |
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <b>Português (Brasil)</b></p>

O Harkback é uma extensão do Chrome para quem lê artigos científicos e documentos técnicos. Selecione um termo e ele o explica no contexto. Cada explicação fica guardada em um registro local somente de acréscimo. Quando o mesmo termo aparece em uma página posterior, mesmo com outra grafia, o Harkback o sublinha e mostra o que você entendeu da última vez.

> “harken back”: voltar a um ponto anterior.

<p align="center">
  <a href="assets/demo.mp4"><img src="assets/demo.gif" alt="Demo" width="720"></a>
  <br><sub>Selecione um termo em um PDF, faça uma pergunta de acompanhamento e a conversa inteira é mantida. Clique na animação para ver o vídeo em qualidade total.</sub>
</p>

## Início rápido

```sh
git clone https://github.com/zestworks-io/harkback.git && cd harkback
pnpm install && pnpm --filter @harkback/extension build
```

Abra `chrome://extensions`, ative o **Modo do desenvolvedor**, escolha **Carregar sem compactação** e selecione `apps/extension/.output/chrome-mv3`. Depois escolha um modelo:

<details open>
<summary><b>Modelo local (grátis)</b></summary>

Instale o [Ollama](https://ollama.com), baixe um modelo e, na página de boas-vindas, escolha **Ollama**. Use _Testar conexão_ para obter o comando que autoriza a extensão. Nada sai do seu computador.

</details>

<details>
<summary><b>Modelo hospedado (com a sua própria chave de API)</b></summary>

Escolha OpenAI, Anthropic, Google Gemini, xAI Grok, OpenRouter ou um endereço personalizado compatível com OpenAI e cole a sua chave. O provedor cobra diretamente de você; o Harkback não tem nenhum servidor no meio.

</details>

Depois, selecione um termo em qualquer página e pressione `Alt+Shift+E`. Veja [Instalação](#instalação) e [Conectar um modelo](#conectar-um-modelo) para mais detalhes. Os primeiros passos estão no [guia de primeiros passos](guide/pt-br/getting-started.md).

<details>
<summary><b>Sumário</b></summary>

- [Por que não perguntar simplesmente ao ChatGPT?](#por-que-não-perguntar-simplesmente-ao-chatgpt)
- [Recursos](#recursos)
- [Seu grafo de conhecimento](#seu-grafo-de-conhecimento)
- [Como funciona](#como-funciona)
- [Instalação](#instalação)
- [Conectar um modelo](#conectar-um-modelo)
- [Usando o Harkback](#usando-o-harkback)
- [Documentação](#documentação)
- [Privacidade](#privacidade)
- [Seus dados](#seus-dados)
- [Limitações](#limitações)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Desenvolvimento](#desenvolvimento)
- [Contribuir](#contribuir)
- [Licença](#licença)

</details>

## Por que não perguntar simplesmente ao ChatGPT?

Você pode colar um termo em um chatbot e receber uma boa resposta. O Harkback não tenta dar uma resposta melhor. Ele acrescenta o que falta a uma janela de chat: **memória**. Cada termo que você consulta vira um registro ligado à página, à citação e à data, e os registros se conectam em um grafo de conhecimento que é seu.

|                    | Perguntar a um chatbot                                      | Harkback                                                                                               |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Contexto**       | Copiar o termo e um trecho, trocar de aba                   | Selecionar o termo na página; o parágrafo e a seção vão junto, e a citação é verificada                |
| **Da próxima vez** | Um chat novo começa vazio, ou você esquece que já perguntou | O termo fica sublinhado nas páginas seguintes, com o que você entendeu da última vez                   |
| **Estrutura**      | Uma pilha de transcrições                                   | Conceitos com apelidos, pré-requisitos, variantes e termos relacionados                                |
| **Retenção**       | Nenhuma                                                     | Uma fila de revisão agendada por um modelo de memória: cada termo volta pouco antes de você esquecê-lo |
| **Seus registros** | Ficam na conta do provedor                                  | Ficam no seu navegador; exporte Markdown, notas do Obsidian ou JSONL                                   |
| **Modelo e custo** | Um serviço, um plano                                        | Qualquer um dos modelos compatíveis: o Ollama local não custa nada, ou use a sua própria chave de API  |

O Harkback é gratuito e de código aberto (Apache-2.0), sem servidor e sem assinatura. Ele precisa de um modelo para escrever as explicações: um modelo local é grátis, e um hospedado é cobrado pelo provedor na sua própria chave.

## Recursos

- **Explicar no contexto.** Selecione um termo, clique em _Explicar_ ou pressione `Alt+Shift+E`. A resposta chega em streaming do modelo que você configurou e é marcada como _definido na fonte_ (a página define o termo e a citação é verificada no texto da página) ou _conhecimento externo_.
- **Lembrar.** Cada explicação, pergunta de acompanhamento e marca de «Entendi / Ainda confuso» é guardada como um evento no IndexedDB. Nada sai do seu navegador, exceto a requisição ao modelo que você aciona.
- **Conversas de acompanhamento.** Pergunte mais no cartão; cada pergunta fica acima da sua resposta, e a conversa é salva com a explicação. O Histórico a mostra por inteiro e a busca a encontra. As fórmulas são tipografadas.
- **Reencontros.** Nas páginas seguintes, os termos que você já consultou ficam sublinhados. Passe o cursor para ver quando e onde você encontrou o termo e o que entendeu, além de uma linha dizendo qual texto da página correspondeu; depois você pode marcá-lo como lembrado, explicá-lo de novo, comparar os dois usos ou silenciá-lo.
- **Um conceito, várias grafias.** `LLM`, `LLMs`, `the LLM`, `large language model` e `Large-Language Models` são o mesmo conceito. Assim como `β-VAE` e `beta-VAE`, e `fine-tuning` e `ﬁne-tuning` com ligatura. Correspondências aproximadas são apresentadas a você como «este é o termo que você consultou há 3 dias?».
- **Termos relacionados.** Se um modelo diz que `QLoRA` é uma variante de `LoRA`, uma página que só menciona `QLoRA` lembra você do que entendeu sobre `LoRA`.
- **Páginas de conceito.** Abra qualquer termo no Histórico para ver o quanto você o entendeu, no que ele se apoia (pré-requisitos), suas variantes e termos relacionados, e cada vez que você o encontrou. Você pode adicionar um apelido, mesclar dois conceitos que são o mesmo, remover uma relação errada ou silenciar um termo.
- **Revisão.** O Histórico mostra um botão _Revisar_ com o número de termos pendentes. Cada termo é agendado com o [FSRS-7](https://github.com/open-spaced-repetition/fsrs4anki), um modelo de memória: avalie uma resposta como _De novo_, _Difícil_, _Bom_ ou _Fácil_ e o termo volta pouco antes de você esquecê-lo, de modo que os fáceis se espaçam rápido e os difíceis voltam logo. Cada botão mostra quando o termo voltará. Você pode digitar o que lembra antes de revelar a explicação, e um botão opcional, **Verificar minha resposta**, pergunta ao seu modelo o quanto você chegou perto (ele só sugere uma nota; você escolhe, e pode desativá-lo nas configurações). A revisão inteira funciona pelo teclado: `Space` mostra a explicação, `1`–`4` avalia, `S` pula. Termos que se apoiam em outros vêm depois dos seus pré-requisitos quando ambos estão pendentes, e um termo com o qual você está tendo dificuldade aponta para os pré-requisitos que talvez estejam faltando. Lembrar um termo em um aviso de reencontro conta como uma revisão leve. Uma configuração define com que probabilidade você quer se lembrar de um termo quando ele vence (90% por padrão). O ícone da barra de ferramentas mostra quantos estão pendentes.
- **Resumo semanal.** Histórico → _Resumo_ mostra o que você encontrou em uma semana: termos novos e revisitados, respostas, os termos que ainda confundem você, onde você leu e novas conexões entre conceitos. Ele é montado no seu computador a partir dos seus registros e não chama nenhum modelo.
- **Constrói sobre o que você sabe.** Quando um termo que você consulta é próximo de um que você já entende, o modelo é informado e pode explicar a diferença em vez de começar do zero.
- **Privado por princípio.** A varredura automática fica limitada ao arxiv.org até você adicionar sites; um botão nas configurações adiciona os sites de pesquisa mais comuns. Sites sensíveis podem ser forçados a usar um modelo local, e janelas anônimas nunca gravam nem escaneiam.
- **Registros portáteis.** Exporte tudo como Markdown, como cartões do Anki, como uma pasta de notas vinculadas (um arquivo por conceito com `[[links]]`, pronto para o Obsidian; o que você escrever abaixo da linha marcadora sobrevive à próxima exportação) ou como um registro de eventos JSONL versionado com um esquema JSON publicado. Um backup JSONL semanal é gravado em `Downloads/harkback`, e **Importar JSONL** no Histórico o restaura (registros que você já tem são ignorados). Uma configuração pode deixar fontes sensíveis fora de backups e exportações.
- **Parar, tentar de novo, trocar de modelo.** Um botão _Parar_ encerra uma resposta enquanto ela é escrita. Depois de uma falha, o cartão oferece _Tentar de novo_ e, com vários modelos configurados, _Tentar com…_ para cada um dos outros.
- **Prévia de uma página antes de ler.** Clique no botão da barra de ferramentas, pressione `Alt+Shift+P` ou use o menu de contexto, e o Harkback se oferece para escanear a página, informando o modelo e se ele é remoto; nada é enviado até você concordar. Uma chamada ao modelo escolhe os termos-chave da página, e os seus próprios registros os classificam em _ainda confuso_, _enferrujado_, _novo para você_ e _conhecido_. A _Prévia_ mostra a sua explicação anterior para um termo que você conhece, ou uma explicação curta escrita pelo modelo para um termo novo, e não grava nada. O modelo vê apenas o texto da página, nunca a sua lista de conceitos, e uma página sensível só usa um modelo local. Uma varredura lê os primeiros 16.000 caracteres de uma página e avisa quando uma página mais longa foi cortada.
- **Legendas do YouTube.** Adicione o YouTube nas configurações e, com as legendas ativadas, os termos que você já consultou ficam sublinhados na linha de legenda. Pause e selecione um termo para explicá-lo a partir das legendas que você assistiu. A consulta é gravada com a posição de reprodução (`12:34`), e o Histórico, a Revisão e as exportações apontam de volta para esse momento. Desativado até você adicionar o site; nada é baixado, apenas a linha de legenda exibida na tela é lida.
- **GitHub, Notion e Google Docs.** Adicione o site nas configurações e suas páginas são lidas pelo próprio layout: o README de um repositório, a conversa de uma issue ou pull request, uma página do Notion, a visualização publicada ou móvel de um documento do Google. Um documento é uma única fonte, não importa como você chegou a ele, e só o seu próprio texto é lido, não os menus ao redor.
- **Pergunta antes de enviar uma página privada.** Uma página que parece privada, como um repositório privado do GitHub ou uma página do Notion ou Google Docs não publicada, não é enviada a nenhum modelo até você escolher _Somente local_ ou _Enviar mesmo assim_. Um cadeado no canto da página mostra e altera o estado; a sua escolha é gravada e pode ser lembrada para o site.
- **Várias formas de começar.** Selecione texto e clique em _Explicar_ (seleções com mouse, teclado ou toque), pressione `Alt+Shift+E` ou use _Explicar_ no menu de contexto. Páginas que carregam mais texto ou passam a outra página sem recarregar são escaneadas de novo.
- **O modelo é você quem escolhe.** O Gemini Nano integrado ao Chrome (no seu computador, nada a configurar), Ollama, OpenAI, Anthropic, Google Gemini, xAI Grok, OpenRouter ou qualquer servidor compatível com OpenAI. Anthropic e Gemini usam suas APIs nativas.

## Seu grafo de conhecimento

Cada consulta se soma a um grafo do que você leu, construído a partir da sua própria leitura e não da memória de um modelo de uso geral.

- **Conceitos são os nós.** `LoRA` é um nó, seja qual for a grafia usada por uma página (`LoRA`, `low-rank adaptation`) e em qualquer idioma em que você o tenha encontrado. Ele guarda seus apelidos, sua área e o quanto você o entendeu.
- **Relações são as arestas.** Um modelo propõe vínculos `variant_of`, `prerequisite` e `related` quando você consulta um termo, por exemplo, `QLoRA` é uma variante de `LoRA`. Você pode remover um vínculo errado, mesclar dois conceitos que são o mesmo ou adicionar um apelido.
- **Tudo aponta de volta para evidências.** Um conceito lista cada encontro: a página, a citação, a data, a sua explicação e a conversa de acompanhamento.
- **O grafo trabalha.** Uma página que só menciona `QLoRA` lembra você de `LoRA`, o modelo é informado do que você já sabe para explicar a diferença, e a revisão é agendada por conceito.
- **É seu.** Exporte uma pasta de notas vinculadas (`[[links]]`, um arquivo por conceito) e abra no Obsidian para ver o grafo lá, ou exporte o registro de eventos completo como JSONL.

Abra **Grafo** no Histórico para vê-lo como um mapa: os conceitos são coloridos pelo quanto você os entendeu (entendido, instável, confuso ou novo), com setas para pré-requisitos e variantes. Filtre por área, por compreensão ou por quando você consultou um termo pela última vez. Arraste para mover, role para dar zoom e clique em um conceito para abri-lo. Você também pode navegar por ele pelas páginas de conceito e, depois de exportar, pelo Obsidian.

## Como funciona

```
 ler                 explicar                lembrar                  reencontrar
 ───                 ────────                ───────                  ───────────
 content script  →   background worker   →   registro de eventos  →  o comparador varre a próxima
 extrai o texto      escolhe um modelo       somente de acréscimo     página atrás de nomes
 da página e         conforme a              (IndexedDB), reproduzido conhecidos, escolhe os
 acompanha a sua     sensibilidade do site,  em conceitos, apelidos   conceitos que valem a pena
 seleção             transmite a resposta e  e encontros              mostrar e desenha o
                     resolve o conceito                               sublinhado + o cartão
```

1. **Ler.** Um content script extrai o texto legível da página (estrutura LaTeXML no arXiv, Readability nos demais) e mantém um mapa dos deslocamentos de texto de volta aos nós do DOM.
2. **Explicar.** O background worker confere as regras do site, escolhe um modelo, aplica um limite de taxa local e envia o termo com o seu parágrafo. O prompt lista os conceitos conhecidos como candidatos para que o modelo possa dizer «este é o mesmo conceito que c1». A resposta é interpretada com tolerância: cartões truncados, vírgulas finais e rótulos decorados são aceitos.
3. **Lembrar.** O resultado vira eventos (`concept.created`, `encounter.created`, `edge.proposed`, ...). Conceitos, apelidos e mesclagens são derivados reproduzindo o registro e nunca armazenados, de modo que uma regra de correspondência melhor aprimora também os registros antigos.
4. **Reencontrar.** Em cada página, um comparador Aho-Corasick varre o texto atrás de todos os nomes e siglas conhecidos. A seleção de reencontros então aplica as regras que a mantêm útil: não na página em que você consultou o termo, não dentro de um intervalo mínimo, conceitos silenciados continuam silenciados, e uma sigla ambígua precisa de um segundo termo da mesma área na página.

## Instalação

Requer Node 22 ou mais recente e [pnpm](https://pnpm.io). Ainda não há uma página em loja, então carregue a extensão a partir do código-fonte:

```sh
# na raiz do repositório
pnpm install
pnpm --filter @harkback/extension build
```

Abra `chrome://extensions`, ative o **Modo do desenvolvedor**, escolha **Carregar sem compactação** e selecione `apps/extension/.output/chrome-mv3`. A página de boas-vindas abre ao instalar.

**Microsoft Edge.** Execute `pnpm build -b edge` em `apps/extension` (ou `pnpm zip:edge`), abra `edge://extensions`, ative o **Modo do desenvolvedor**, escolha **Carregar descompactada** e selecione `apps/extension/.output/edge-mv3`. O Edge pode não oferecer o modelo integrado do Chrome; escolha outro modelo na configuração.

## Conectar um modelo

A configuração inicial tem três etapas: **Boas-vindas** (um exemplo de aviso de reencontro e uma explicação de exemplo embutida que você pode testar sem chamar nenhum modelo), **Privacidade** (para onde vai o seu texto; você precisa marcar a caixa de consentimento para que _Avançar_ seja habilitado) e **Modelo** (escolha um provedor e depois _Concluir_). Executar a configuração de novo atualiza o modelo que você já tem em vez de adicionar uma cópia. Você pode adicionar mais modelos e mudar opções depois, na página de configurações, que também define limites de taxa, avisos de reencontro e quanto tempo um modelo pode ficar em silêncio antes de a requisição ser abandonada.

![A página de configurações com um modelo: nome, modelo, endereço, chave de API e um botão Testar conexão](assets/settings.png)

| Provedor                       | Base URL                                           | Observações                                                                                                                                                           |
| ------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ollama                         | `http://127.0.0.1:11434/v1`                        | Local, sem chave. Veja abaixo.                                                                                                                                        |
| Chrome integrado (Gemini Nano) | nenhuma                                            | Neste computador, sem chave. Baixe na configuração ou nas configurações. Um modelo pequeno: mais lento que um modelo na nuvem e melhor em inglês, espanhol e japonês. |
| OpenAI                         | `https://api.openai.com/v1`                        | Precisa de uma chave de API.                                                                                                                                          |
| Anthropic                      | `https://api.anthropic.com/v1`                     | Precisa de uma chave de API.                                                                                                                                          |
| Google Gemini                  | `https://generativelanguage.googleapis.com/v1beta` | Precisa de uma chave de API.                                                                                                                                          |
| xAI Grok                       | `https://api.x.ai/v1`                              | Precisa de uma chave de API.                                                                                                                                          |
| OpenRouter                     | `https://openrouter.ai/api/v1`                     | Precisa de uma chave de API.                                                                                                                                          |
| Personalizado                  | qualquer endereço                                  | `https`, exceto neste computador e na sua própria rede (`192.168.x.x`, `10.x.x.x`, `name.local`, Tailscale).                                                          |

Cada provedor fala o seu próprio formato: Anthropic e Google Gemini usam suas APIs nativas, e todo o resto, incluindo Ollama, Grok, OpenRouter e qualquer endereço personalizado, como um proxy da empresa, usa o formato compatível com OpenAI. Escolher um provedor preenche o endereço dele, que você ainda pode editar. Escolha **Personalizado** para qualquer outro serviço compatível com OpenAI.

O Chrome pede que você permita o acesso ao endereço do modelo na primeira vez em que você o testa ou salva. Se você recusar, o cartão de explicação diz isso em vez de falhar com um erro de rede.

O **Ollama** rejeita requisições de extensões do navegador a menos que a origem da extensão seja permitida. O botão _Testar conexão_ mostra o comando exato para o seu sistema, por exemplo no macOS:

```sh
launchctl setenv OLLAMA_ORIGINS "chrome-extension://<your-extension-id>"
```

e depois reinicie o Ollama.

## Usando o Harkback

| Você quer                                 | Faça isto                                                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Explicar um termo                         | Selecione-o e clique em **Explicar**, ou pressione `Alt+Shift+E`.                                                                                                              |
| Perguntar mais                            | Use **Perguntar mais** no cartão. A pergunta e a resposta são salvas com a explicação.                                                                                         |
| Escanear uma página que não é do arXiv    | Clique no botão da barra de ferramentas, ou permita o site em _Sites_ nas configurações para varreduras automáticas.                                                           |
| Ler um PDF                                | Clique no botão da barra de ferramentas no PDF: artigos do arXiv abrem em HTML, outros PDFs abrem no leitor.                                                                   |
| Ver o que você já consultou               | Abra a página do histórico pela página de configurações ou pela de boas-vindas. Ela se atualiza ao vivo, e o título da fonte de cada entrada leva de volta à página de origem. |
| Guardar seus registros                    | Página do histórico → **Exportar Markdown**, **Exportar cartões do Anki** ou **Fazer backup JSONL agora**.                                                                     |
| Restaurar de um backup                    | Página do histórico → **Importar JSONL**.                                                                                                                                      |
| Ver como os conceitos se conectam         | Página do histórico → **Grafo**.                                                                                                                                               |
| Parar de sublinhar um termo               | Passe o cursor sobre o sublinhado → **Não mostrar novamente**.                                                                                                                 |
| Manter uma fonte longe de modelos remotos | Cartão → **Marcar fonte como sensível**, ou adicione uma regra de sensibilidade para o site nas configurações.                                                                 |
| Resolver uma página que parece privada    | O cadeado no canto da página, ou a pergunta na sua primeira explicação: **Somente local** ou **Enviar mesmo assim**.                                                           |

## Documentação

A pasta [`guide/`](guide/README.md) tem os detalhes (em inglês, exceto o [guia de primeiros passos](guide/pt-br/getting-started.md)):

- [Primeiros passos](guide/pt-br/getting-started.md), o [guia do usuário](guide/user-guide.md), [modelos e provedores](guide/models.md) e [solução de problemas](guide/troubleshooting.md).
- [Privacidade e fontes sensíveis](guide/privacy.md): o que é enviado, o que nunca é e como isso é garantido.
- [Arquitetura](guide/architecture.md) e o [formato dos dados](guide/data-format.md), para quem contribui e para quem quer construir sobre os seus registros.
- O [histórico de mudanças](CHANGELOG.md).

## Privacidade

- Quando você pede uma explicação, o texto selecionado, o parágrafo dele, a seção e o título da página vão para o serviço de modelo que você configurou, sob os termos desse provedor.
- Na revisão, o botão opcional **Verificar minha resposta** envia o termo, a sua resposta digitada e a explicação guardada ao seu modelo, somente quando você o pressiona. Desative-o nas configurações e o botão nunca aparece. Ele segue as mesmas regras de modelo e de fontes sensíveis de uma explicação.
- Os registros ficam neste navegador. Os backups contêm apenas registros, nunca configurações nem chaves de API.
- As páginas só são escaneadas automaticamente no arxiv.org. Em qualquer outro lugar, você precisa clicar no botão, pressionar `Alt+Shift+E` ou permitir o site.
- O conteúdo de uma fonte sensível nunca é enviado a um modelo não local, inclusive como contexto para comparações posteriores. Um servidor na sua própria rede conta como não local. Uma fonte continua sensível até você marcá-la como normal na entrada dela no Histórico.
- Uma página que parece privada (um repositório privado do GitHub; uma página do Notion ou Google Docs não publicada) não é enviada a nenhum modelo até você escolher. Páginas que o site não marca de nenhuma das duas formas são perguntadas no Notion e no Google Docs, e não no GitHub. O que uma página sugere sobre si mesma é apenas uma dica; por isso, marque um site como sensível quando isso importar.
- Uma configuração deixa as fontes sensíveis fora dos backups e das exportações.
- Janelas anônimas explicam, mas nunca gravam, escaneiam nem mostram reencontros.
- Os sublinhados de reencontro vivem na página; assim, os scripts da própria página podem inferir de quais termos você tem registros.
- Excluir uma explicação a remove do aplicativo; podem restar vestígios no disco, e backups exportados não podem ser recolhidos.
- As chaves de API são armazenadas **sem criptografia** no armazenamento da extensão.

As notas exibidas na extensão são a fonte de verdade: [`apps/extension/src/lib/pages/privacy.ts`](apps/extension/src/lib/pages/privacy.ts).

## Seus dados

Tudo é um evento em um registro somente de acréscimo. O formato é público:

- Tipos de evento e cargas: [`packages/spec`](packages/spec), com o [esquema JSON](packages/spec/schema/event.schema.json) gerado.
- Reprodução, correspondência e exportação: [`packages/core`](packages/core), que não tem dependências do navegador e pode ser usado sozinho.

Como conceitos e apelidos são derivados do registro, o seu backup JSONL é uma cópia completa e portátil do que você sabe.

## Limitações

- Chrome e Microsoft Edge (Manifest V3). Firefox e Safari não são compatíveis. O modelo integrado do Chrome não está disponível em todos os navegadores; o Edge precisa de outro modelo.
- As explicações dependem do modelo que você escolhe; modelos locais pequenos podem produzir cartões de conceito mais fracos, o que reduz a qualidade dos reencontros, mas nunca atrapalha a gravação.
- O texto do visualizador de PDF integrado ao navegador não pode ser lido, então o Harkback abre o PDF em uma página de leitura própria (artigos do arXiv vão para a versão HTML). PDFs digitalizados são lidos com OCR no seu computador (o inglês vem embutido; os demais idiomas são um download cada, de `cdn.jsdelivr.net`), o que é mais lento e menos exato que texto de verdade, não recupera manuscritos, fórmulas nem tabelas, e a detecção de parágrafos em layouts complicados (tabelas, figuras com texto, três ou mais colunas) é aproximada. Um PDF no seu computador precisa de duas aprovações: ative «Permitir acesso a URLs de arquivo» para o Harkback em `chrome://extensions` e depois clique em «Permitir arquivos locais» na página de leitura na primeira vez.
- A correspondência automática de siglas precisa de pelo menos três palavras no nome completo (`LLM` de `Large Language Model`). Duas siglas que correspondem a nomes completos diferentes na mesma área (por exemplo, dois «GNN» distintos) são mantidas como conceitos separados.
- Nomes em chinês, e nomes em japonês escritos apenas em kanji, precisam ter pelo menos três caracteres para serem sublinhados, a fim de evitar falsos positivos. Nomes com kana ou hangul precisam de dois.
- YouTube: só são lidas as páginas `www.youtube.com/watch` com legendas (CC) ativadas, e só as linhas de legenda que o player exibiu desde que a página foi aberta ficam disponíveis como contexto. As legendas geradas automaticamente costumam errar a grafia de termos técnicos, e um termo escrito errado não corresponde aos seus registros. Shorts, players incorporados em outros sites e o modo de tela cheia (o player esconde os avisos do Harkback; use o modo teatro) não são compatíveis, e uma mudança na página do YouTube pode impedir a leitura das legendas até o Harkback ser atualizado.
- GitHub, Notion e Google Docs: só são lidas as páginas iniciais de repositórios, issues e pull requests (não arquivos de código), páginas do Notion e documentos do Google na visualização publicada ou móvel. O Notion mostra apenas os blocos que já desenhou, então uma página longa pode ser lida em parte. O editor do Google Docs desenha o próprio texto e não pode ser lido, e a visualização de pré-visualização não foi verificada. Esses sites mudam o layout sem aviso; quando o Harkback deixa de reconhecer um, ele lê a página como qualquer outra até ser atualizado.
- Os acentos são ignorados na correspondência («résumé» e «resume» são um só termo), mas não há redução a radicais para idiomas além do inglês, então formas flexionadas, como os plurais em alemão, são termos separados.
- A interface está em inglês por padrão e também está disponível em chinês simplificado e tradicional, japonês, coreano, espanhol, francês, alemão e português do Brasil. As explicações podem ser escritas em 16 idiomas, escolhidos separadamente nas configurações. As notas e o Markdown exportados usam apenas rótulos em inglês ou chinês.

## Estrutura do repositório

| Caminho          | O que é                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/spec`  | O formato de eventos: constantes, esquemas zod e o esquema JSON gerado.                                                                                                  |
| `packages/core`  | Lógica pura: reprodução, normalização de nomes, correspondência de conceitos, seleção de reencontros, prompts, interpretação da saída, exportação para JSONL e Markdown. |
| `apps/extension` | A extensão do Chrome, construída com o [WXT](https://wxt.dev): content script, background worker, histórico, configurações e boas-vindas.                                |
| `tools/lint`     | Configuração do ESLint.                                                                                                                                                  |
| `guide`          | A documentação: guia do usuário, modelos, privacidade, arquitetura, formato dos dados.                                                                                   |

## Desenvolvimento

```sh
pnpm install
pnpm --filter @harkback/extension dev     # recarga ao vivo
```

Antes de abrir um pull request:

```sh
pnpm typecheck     # todos os pacotes
pnpm lint          # ESLint
pnpm test          # testes unitários
pnpm check:build   # build de produção: permissões do manifest e tamanho do content script
pnpm e2e           # testes de ponta a ponta no Chromium (execute uma vez `pnpm exec playwright install chromium`)
pnpm format:check  # formatação
```

Para empacotar uma versão para o Microsoft Edge Add-ons, execute `pnpm zip:edge` (veja `store/edge/README.md`). Para empacotar uma versão para a Chrome Web Store, aumente `version` em `apps/extension/package.json` e depois execute `pnpm release`. Ele roda as verificações, gera a extensão de produção, valida o pacote e grava `apps/extension/.output/harkback-<version>-chrome.zip`. Use `tools/package.sh --skip-checks` para gerar apenas o zip.

Os testes de ponta a ponta carregam a extensão compilada no Chromium, servem páginas do arXiv a partir de `apps/extension/fixtures` e conversam com um servidor de modelo simulado local. Eles cobrem o ciclo inteiro: ler um artigo, explicar, gravar, a página do histórico e reencontros em outros artigos. Veja `apps/extension/e2e`.

## Contribuir

Relatos de bugs e pull requests são bem-vindos. Leia primeiro o [CONTRIBUTING.md](CONTRIBUTING.md). Para relatar um problema de segurança, veja o [SECURITY.md](SECURITY.md).

## Licença

[Apache-2.0](LICENSE)
