# Página da Chrome Web Store: português (Brasil)

**Nome:** Harkback

**Resumo** (limite de 132 caracteres):
Explica termos enquanto você lê, guarda o que você entendeu e traz de volta quando você encontra o termo de novo.

**Categoria:** Produtividade

**Idioma:** Português (Brasil)

## Descrição

O Harkback é para quem lê artigos e documentos técnicos. Selecione um termo e ele o explica no contexto do parágrafo que você está lendo. Cada explicação fica salva no seu navegador. Quando o mesmo termo aparece numa página posterior, mesmo escrito de outra forma, o Harkback o sublinha e mostra o que você entendeu da última vez.

Ele não tenta ser um chatbot melhor. Acrescenta o que uma janela de chat não tem: memória.

COMO FUNCIONA
• Selecione um termo e clique em Explicar, use o menu de contexto ou pressione Alt+Shift+E. A explicação usa o parágrafo e a seção ao redor do termo e cita a página quando ela o define.
• Revise os termos de que você não tem certeza. O Harkback os agenda com o modelo de memória FSRS-7: avalie-se com De novo, Difícil, Bom ou Fácil e cada termo volta pouco antes de você esquecê-lo. Termos que se apoiam em outros são revisados na ordem certa, e um termo confuso aponta os pré-requisitos que talvez estejam faltando. Clique com o botão direito no ícone da barra de ferramentas para abrir Revisão ou Histórico.
• Veja uma prévia da página antes de ler: quais termos-chave são novos para você e quais você já conhece.
• Em páginas posteriores, os termos que você já consultou ficam sublinhados. Passe o mouse para ver a explicação anterior, onde você o encontrou e o quanto entendeu. Abreviações correspondem aos nomes completos (“LLM” e “Large Language Model”).
• Faça perguntas de acompanhamento em qualquer cartão. A conversa é salva com a explicação. Interrompa uma resposta no meio ou tente de novo com outro modelo se um falhar.
• Seus registros formam um grafo de conhecimento de conceitos, apelidos, pré-requisitos, variantes e termos relacionados. Confirme uma relação sobre a qual o modelo não tinha certeza e divida um conceito que juntou dois termos diferentes (isso também desfaz uma mesclagem). Pesquise, revise, veja como um mapa, exporte como notas em Markdown (com [[links]] para o Obsidian), como cartões do Anki ou como um backup JSONL que você pode importar de novo.
• Contribua para o acervo comum de dados: o Harkback monta um arquivo anônimo a partir das suas consultas em artigos do arXiv e com DOI que têm licença aberta (identificador do artigo, termo, área, o quanto você entendeu, o mês), mostra tudo para você e o salva no seu computador.

PDFS E ARTIGOS
Artigos do arXiv funcionam automaticamente. Outros PDFs abrem no leitor próprio do Harkback, com as fórmulas tipografadas. PDFs escaneados são lidos com OCR no seu computador enquanto você rola a página e depois se comportam como texto. O inglês já vem incluído; os outros idiomas são baixados uma vez a partir de uma lista. Outros sites só são escaneados quando você clica no botão da barra de ferramentas ou permite o site. Em Configurações → Sites você também pode adicionar o GitHub (READMEs, issues e pull requests), o Notion, o Google Docs (visualização publicada ou para celular) e as legendas do YouTube, ou adicionar com um botão sites de pesquisa comuns como bioRxiv, PubMed e OpenReview. Nas legendas automáticas do YouTube, os termos são reconhecidos mesmo quando o reconhecimento de fala os escreve em minúsculas, soletra letra por letra ou os ouve um pouco errado.

VOCÊ ESCOLHE O MODELO
O Harkback não tem servidor nem conta. Você conecta o seu próprio modelo: um que roda no seu computador, de modo que seu texto nunca sai dele, ou um serviço hospedado que você usa com a sua própria chave de API. Modelos da sua própria rede também funcionam. O modelo integrado do Chrome (Gemini Nano) roda no seu computador sem nada para configurar. É um modelo pequeno, então é mais lento que um modelo na nuvem e serve melhor para explicações curtas.

PRIVACIDADE
• Seus registros ficam no seu navegador. O desenvolvedor não recebe nada.
• Só o que você aciona é enviado ao modelo que você configurou: numa explicação, o texto selecionado, o parágrafo, a seção e o título da página; numa prévia da página, o texto da página; em “Verificar minha resposta”, o termo e a sua resposta.
• Marque uma fonte como sensível e o conteúdo dela é enviado apenas a um modelo local, nunca a um remoto. Uma página que parece privada (um repositório privado do GitHub, uma página do Notion ou do Google Docs não publicada) não é enviada a nenhum modelo até você escolher Somente local ou Enviar mesmo assim.
• Janelas privadas explicam, mas não registram nada.
• No YouTube, o Harkback lê apenas as legendas que o player está mostrando, e só depois que você adiciona o site.
• O arquivo para o acervo comum de dados não tem citações, explicações, endereços nem horários exatos, e nunca inclui uma fonte sensível. Nada é enviado: você decide se vai submetê-lo a algum lugar.
• O próprio Harkback baixa apenas dados opcionais de idioma para OCR, uma única vez e conferidos por uma soma de verificação. Se você escolher o modelo integrado do Chrome, é o Chrome que o baixa quando você clica em Baixar.
• Sem análise de uso, sem anúncios, sem rastreamento. Código aberto sob a licença Apache-2.0.
• As chaves de API ficam sem criptografia no armazenamento da extensão; use uma chave com limite de gastos.

IDIOMAS
A interface está disponível em dez idiomas, e as explicações podem ser escritas em 16.

Código-fonte, política de privacidade e suporte: veja os links nesta página.
