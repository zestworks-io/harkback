# Ficha de Chrome Web Store: español

**Nombre:** Harkback

**Resumen** (máximo 132 caracteres):
Explica términos mientras lees, recuerda lo que entendiste y te lo devuelve cuando vuelves a encontrar el término.

**Categoría:** Productividad

**Idioma:** Español

## Descripción

Harkback es para quienes leen artículos y documentos técnicos. Selecciona un término y lo explica en el contexto del párrafo que estás leyendo. Cada explicación se guarda en tu navegador. Cuando el mismo término aparece en una página posterior, aunque esté escrito de otra forma, Harkback lo subraya y muestra lo que entendiste la última vez.

No intenta ser un chatbot mejor. Añade lo que le falta a una ventana de chat: memoria.

CÓMO FUNCIONA
• Selecciona un término y haz clic en Explicar, usa el menú contextual o pulsa Alt+Shift+E. La explicación usa el párrafo y la sección que rodean al término, y cita la página cuando esta lo define.
• Repasa los términos de los que no estás seguro. Harkback los programa con el modelo de memoria FSRS-7: valórate con Otra vez, Difícil, Bien o Fácil y cada término vuelve justo antes de que lo olvides. Los términos que se apoyan en otros se repasan en el orden correcto, y un término confuso señala los requisitos previos que quizá te faltan. Haz clic derecho en el icono de la barra de herramientas para abrir Repaso o Historial.
• Ve una vista previa de la página antes de leerla: qué términos clave son nuevos para ti y cuáles ya conoces.
• En páginas posteriores se subrayan los términos que ya has consultado. Pasa el cursor para ver la explicación anterior, dónde lo encontraste y cuánto lo entendiste. Las abreviaturas coinciden con sus nombres completos («LLM» y «Large Language Model»).
• Haz preguntas de seguimiento en cualquier tarjeta. La conversación se guarda con la explicación. Detén una respuesta a medias o reintenta con otro modelo si uno falla.
• Tus registros forman un grafo de conocimiento de conceptos, alias, requisitos previos, variantes y términos relacionados. Confirma una relación de la que el modelo no estaba seguro y divide un concepto que juntó dos términos distintos (así también se deshace una fusión). Búscalo, repásalo, míralo como un mapa, expórtalo como notas en Markdown (con [[enlaces]] para Obsidian), como tarjetas de Anki o como una copia de seguridad JSONL que puedes volver a importar.
• Aporta al bien común de datos: Harkback crea un archivo anónimo a partir de tus consultas en artículos de arXiv y DOI con licencia abierta (identificador del artículo, término, área, cuánto lo entendiste, el mes), te lo muestra entero y lo guarda en tu ordenador.

PDF Y ARTÍCULOS
Los artículos de arXiv funcionan automáticamente. Los demás PDF se abren en el lector propio de Harkback, con las fórmulas tipografiadas. Los PDF escaneados se leen con OCR en tu ordenador mientras te desplazas y luego se comportan como texto. El inglés viene incluido; los demás idiomas se descargan una vez desde una lista. Los demás sitios web solo se escanean cuando haces clic en el botón de la barra de herramientas o permites el sitio. En Ajustes → Sitios también puedes añadir GitHub (README, issues y pull requests), Notion, Google Docs (vista publicada o móvil) y los subtítulos de YouTube, o añadir con un botón sitios de investigación habituales como bioRxiv, PubMed y OpenReview. En los subtítulos automáticos de YouTube, los términos se reconocen aunque el reconocimiento de voz los escriba en minúsculas, los deletree letra a letra o los oiga ligeramente mal.

TÚ ELIGES EL MODELO
Harkback no tiene servidor ni cuenta. Conectas tu propio modelo: uno que se ejecuta en tu ordenador, de modo que tu texto nunca sale de él, o un servicio alojado que usas con tu propia clave de API. También funcionan los modelos de tu propia red. El modelo integrado de Chrome (Gemini Nano) se ejecuta en tu ordenador sin nada que configurar. Es un modelo pequeño, por lo que es más lento que uno en la nube y va mejor con explicaciones cortas.

PRIVACIDAD
• Tus registros se quedan en tu navegador. El desarrollador no recibe nada.
• Solo se envía al modelo que configuraste lo que tú activas: para una explicación, el texto seleccionado, su párrafo, la sección y el título de la página; para una vista previa de página, el texto de la página; para «Comprobar mi respuesta», el término y tu respuesta.
• Marca una fuente como sensible y su contenido se envía solo a un modelo local, nunca a uno remoto. Una página que parece privada (un repositorio privado de GitHub, una página de Notion o Google Docs sin publicar) no se envía a ningún modelo hasta que eliges Solo local o Enviar igualmente.
• Las ventanas privadas explican, pero no registran nada.
• En YouTube, Harkback lee únicamente los subtítulos que muestra el reproductor, y solo después de que añadas el sitio.
• El archivo para el bien común de datos no tiene citas, explicaciones, direcciones ni horas exactas, y nunca incluye una fuente sensible. No se sube nada: tú decides si lo envías a algún sitio.
• Harkback solo descarga por sí mismo datos opcionales de idioma para OCR, una vez y comprobados con una suma de verificación. Si eliges el modelo integrado de Chrome, es Chrome quien lo descarga cuando haces clic en Descargar.
• Sin analítica, sin anuncios, sin seguimiento. Código abierto con licencia Apache-2.0.
• Las claves de API se guardan sin cifrar en el almacenamiento de la extensión; usa una clave con límite de gasto.

IDIOMAS
La interfaz está disponible en diez idiomas y las explicaciones pueden escribirse en 16.

Código fuente, política de privacidad y soporte: consulta los enlaces de esta página.
